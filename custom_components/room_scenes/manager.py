"""Room scene storage, activation and active-scene tracking."""
from __future__ import annotations

import asyncio
import logging
import math
import time
import uuid
from typing import Any

import voluptuous as vol
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.helpers.storage import Store

from .const import (
    ACTIVATION_GRACE_SECONDS,
    BRIGHTNESS_TOLERANCE,
    KELVIN_TOLERANCE,
    SIGNAL_DATA_UPDATED,
    SIGNAL_SCENE_ADDED,
    SIGNAL_SCENE_REMOVED,
    STORAGE_KEY,
    STORAGE_VERSION,
    XY_TOLERANCE,
)
from .dynamic_scenes import DynamicSceneManager
from .presets import apply_light_targets, compute_preset_lights, get_preset, light_capabilities
from .util import resolve_targets
from .z2m import Z2MBridge

_LOGGER = logging.getLogger(__name__)

SCENE_SCHEMA = vol.Schema(
    {
        vol.Optional("id"): str,
        vol.Required("area_id"): str,
        vol.Required("name"): vol.All(str, vol.Length(min=1, max=64)),
        vol.Optional("preset_id"): vol.Any(None, str),
        vol.Optional("icon"): vol.Any(None, str),
        vol.Required("lights"): {
            str: {
                vol.Required("state"): vol.In(["on", "off"]),
                vol.Optional("brightness"): vol.Any(None, vol.All(vol.Coerce(int), vol.Range(1, 255))),
                vol.Optional("xy"): vol.Any(None, [vol.Coerce(float)]),
                vol.Optional("color_temp_kelvin"): vol.Any(None, vol.Coerce(int)),
            }
        },
        vol.Optional("dynamic", default=False): bool,
        vol.Optional("interval", default=30): vol.All(vol.Coerce(int), vol.Range(3, 3600)),
        vol.Optional("transition", default=0.4): vol.All(vol.Coerce(float), vol.Range(0, 300)),
        vol.Optional("z2m_sync", default=True): bool,
    },
    extra=vol.REMOVE_EXTRA,
)


def _xy_distance(a, b) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


class RoomSceneManager:
    def __init__(self, hass: HomeAssistant, preset_data: dict, z2m_base_topic: str | None):
        self.hass = hass
        self.preset_data = preset_data
        self.store: Store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self.scenes: dict[str, dict] = {}
        self.rooms: dict[str, dict] = {}
        self.active: dict[str, str] = {}
        self.z2m_status: dict[str, str] = {}
        self.dynamic = DynamicSceneManager(preset_data, self._notify)
        self.z2m = Z2MBridge(hass, z2m_base_topic, self._notify) if z2m_base_topic else None
        self._grace_until: dict[str, float] = {}
        self._unsubs: list = []
        self._track_unsub = None

    # ------------------------------------------------------------------ lifecycle

    async def async_load(self) -> None:
        data = await self.store.async_load() or {}
        self.scenes = {s["id"]: s for s in data.get("scenes", [])}
        for scene in self.scenes.values():
            if scene.get("preset_id"):
                try:
                    scene["preset_id"] = get_preset(self.preset_data, scene["preset_id"])["id"]
                except vol.Invalid:
                    pass
        self.rooms = data.get("rooms", {})
        self.active = data.get("active", {})
        if self.z2m:
            await self.z2m.async_start()

        for event in (ar.EVENT_AREA_REGISTRY_UPDATED, er.EVENT_ENTITY_REGISTRY_UPDATED, dr.EVENT_DEVICE_REGISTRY_UPDATED):
            self._unsubs.append(self.hass.bus.async_listen(event, self._registry_updated))
        self._retrack()

    def async_unload(self) -> None:
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()
        if self._track_unsub:
            self._track_unsub()
        self.dynamic.stop_all()
        if self.z2m:
            self.z2m.stop()

    @callback
    def _registry_updated(self, _event: Event) -> None:
        self._retrack()
        self._notify()

    def _save(self) -> None:
        self.store.async_delay_save(
            lambda: {
                "scenes": list(self.scenes.values()),
                "rooms": self.rooms,
                "active": self.active,
            },
            1,
        )

    @callback
    def _notify(self) -> None:
        async_dispatcher_send(self.hass, SIGNAL_DATA_UPDATED)

    # ------------------------------------------------------------------ rooms

    def room_lights(self, area_id: str) -> list[str]:
        lights = resolve_targets(self.hass, [], [], [area_id], [], [])
        return sorted(e for e in lights if e.startswith("light."))

    def get_rooms(self) -> list[dict]:
        area_reg = ar.async_get(self.hass)
        rooms = []
        for area in area_reg.async_list_areas():
            lights = self.room_lights(area.id)
            if not lights:
                continue
            settings = self.rooms.get(area.id, {})
            room = {
                "area_id": area.id,
                "name": area.name,
                "icon": area.icon,
                "picture": area.picture,
                "floor_id": area.floor_id,
                "lights": lights,
                "z2m_group": settings.get("z2m_group"),
                "scene_order": self._ordered_scene_ids(area.id),
            }
            if self.z2m and self.z2m.available:
                room["z2m_suggestion"] = self.z2m.suggest_group(lights)
                room["z2m_covered"] = self.z2m.covered_lights(settings.get("z2m_group"), lights)
            rooms.append(room)
        rooms.sort(key=lambda r: r["name"].lower())
        return rooms

    def _ordered_scene_ids(self, area_id: str) -> list[str]:
        order = self.rooms.get(area_id, {}).get("scene_order", [])
        ids = [s_id for s_id in order if s_id in self.scenes and self.scenes[s_id]["area_id"] == area_id]
        ids += sorted(
            (s["id"] for s in self.scenes.values() if s["area_id"] == area_id and s["id"] not in ids),
            key=lambda i: self.scenes[i].get("created", 0),
        )
        return ids

    def set_room_settings(self, area_id: str, settings: dict) -> None:
        room = self.rooms.setdefault(area_id, {})
        if "z2m_group" in settings:
            old = room.get("z2m_group")
            room["z2m_group"] = settings["z2m_group"] or None
            if old != room["z2m_group"]:
                for scene in self.scenes.values():
                    if scene["area_id"] == area_id:
                        scene.pop("z2m_scene_id", None)
                        scene.pop("z2m_group", None)
                        self.z2m_status.pop(scene["id"], None)
        if "scene_order" in settings:
            room["scene_order"] = list(settings["scene_order"])
        self._save()
        self._notify()

    def get_data(self) -> dict:
        return {
            "rooms": self.get_rooms(),
            "scenes": list(self.scenes.values()),
            "active": self.active,
            "dynamic": self.dynamic.get_all_as_dict()["dynamic_scenes"],
            "z2m": {
                "enabled": self.z2m is not None,
                "available": bool(self.z2m and self.z2m.available),
                "groups": self.z2m.group_names() if self.z2m else [],
                "status": self.z2m_status,
            },
        }

    # ------------------------------------------------------------------ scenes CRUD

    def palette_for(self, scene: dict) -> list:
        palette = []
        for target in scene["lights"].values():
            if target.get("state") != "on":
                continue
            if target.get("xy"):
                palette.append({"xy": target["xy"], "brightness": target.get("brightness", 255)})
            elif target.get("color_temp_kelvin"):
                palette.append({"kelvin": target["color_temp_kelvin"], "brightness": target.get("brightness", 255)})
            else:
                palette.append({"kelvin": 2700, "brightness": target.get("brightness", 255)})
        return palette

    async def async_save_scene(self, raw: dict) -> dict:
        scene = SCENE_SCHEMA(raw)
        if scene.get("preset_id"):
            try:
                scene["preset_id"] = get_preset(self.preset_data, scene["preset_id"])["id"]
            except vol.Invalid:
                scene["preset_id"] = None
                scene["dynamic"] = False
        is_new = "id" not in scene or scene["id"] not in self.scenes
        if is_new:
            scene["id"] = uuid.uuid4().hex[:12]
            scene["created"] = time.time()
        else:
            old = self.scenes[scene["id"]]
            scene["created"] = old.get("created", time.time())
            for key in ("z2m_scene_id", "z2m_group"):
                if key in old:
                    scene[key] = old[key]
        scene["palette"] = self.palette_for(scene)
        self.scenes[scene["id"]] = scene
        self._save()
        self._retrack()
        if is_new:
            async_dispatcher_send(self.hass, SIGNAL_SCENE_ADDED, scene["id"])
        self._notify()

        if self._z2m_group_for(scene) and scene.get("z2m_sync") and not scene.get("dynamic"):
            self.hass.async_create_task(self._async_store_on_lamps(scene["id"]))
        return scene

    async def async_delete_scene(self, scene_id: str) -> None:
        scene = self.scenes.pop(scene_id, None)
        if scene is None:
            return
        if self.active.get(scene["area_id"]) == scene_id:
            self.active.pop(scene["area_id"])
        if self.z2m and scene.get("z2m_scene_id") and scene.get("z2m_group"):
            await self.z2m.remove_scene(scene["z2m_group"], scene["z2m_scene_id"])
        self.z2m_status.pop(scene_id, None)
        self._save()
        self._retrack()
        async_dispatcher_send(self.hass, SIGNAL_SCENE_REMOVED, scene_id)
        self._notify()

    # ------------------------------------------------------------------ z2m

    def _z2m_group_for(self, scene: dict) -> str | None:
        if not self.z2m:
            return None
        return self.rooms.get(scene["area_id"], {}).get("z2m_group")

    def _allocate_z2m_id(self, group: str, scene_id: str) -> int:
        used = {
            s["z2m_scene_id"]
            for s in self.scenes.values()
            if s.get("z2m_group") == group and s.get("z2m_scene_id") and s["id"] != scene_id
        }
        for candidate in range(1, 255):
            if candidate not in used:
                return candidate
        raise vol.Invalid("No free Zigbee scene IDs left for this group")

    async def _async_store_on_lamps(self, scene_id: str) -> None:
        scene = self.scenes.get(scene_id)
        group = scene and self._z2m_group_for(scene)
        if not scene or not group:
            return
        self.z2m_status[scene_id] = "storing"
        self._notify()
        try:
            room_lights = self.room_lights(scene["area_id"])
            covered = self.z2m.covered_lights(group, room_lights) or room_lights
            targets = {e: t for e, t in scene["lights"].items() if e in covered}
            self._start_grace(scene["area_id"])
            await apply_light_targets(self.hass, targets, transition=0)
            await self._wait_until_matching(targets, timeout=6)
            z2m_id = scene.get("z2m_scene_id") if scene.get("z2m_group") == group else None
            z2m_id = z2m_id or self._allocate_z2m_id(group, scene_id)
            await self.z2m.store_scene(group, z2m_id, scene["name"])
            scene["z2m_scene_id"] = z2m_id
            scene["z2m_group"] = group
            self.active[scene["area_id"]] = scene_id
            self.z2m_status[scene_id] = "stored"
            self._save()
        except Exception as err:  # noqa: BLE001
            _LOGGER.warning("Storing scene %s on lamps failed: %s", scene_id, err)
            self.z2m_status[scene_id] = "failed"
        self._notify()

    async def _wait_until_matching(self, targets: dict, timeout: float) -> None:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if all(self._matches(e, t, strict=True) for e, t in targets.items()):
                await asyncio.sleep(0.5)  # let lamps settle
                return
            await asyncio.sleep(0.25)
        _LOGGER.debug("Lamps did not report the target state in time; storing anyway")

    # ------------------------------------------------------------------ activation

    def _start_grace(self, area_id: str, seconds: float = ACTIVATION_GRACE_SECONDS) -> None:
        self._grace_until[area_id] = time.monotonic() + seconds

    async def async_activate(self, scene_id: str, transition: float | None = None) -> None:
        scene = self.scenes.get(scene_id)
        if scene is None:
            raise vol.Invalid(f"Room scene '{scene_id}' not found")
        area_id = scene["area_id"]
        lights = [e for e in scene["lights"] if self.hass.states.get(e) is not None]
        transition = scene.get("transition", 0.4) if transition is None else transition

        for entity_id in self.room_lights(area_id):
            self.dynamic.stop_all_for_entity_id(entity_id)
        self._start_grace(area_id, ACTIVATION_GRACE_SECONDS + (transition or 0))

        if scene.get("dynamic") and scene.get("preset_id"):
            on_lights = [e for e in lights if scene["lights"][e]["state"] == "on"]
            off_targets = {e: t for e, t in scene["lights"].items() if t["state"] == "off"}
            await apply_light_targets(self.hass, off_targets, transition)
            brightness = next(
                (scene["lights"][e].get("brightness") for e in on_lights if scene["lights"][e].get("brightness")),
                None,
            )
            self.dynamic.create_new(
                self.hass,
                {
                    "preset_id": scene["preset_id"],
                    "light_entity_ids": on_lights,
                    "brightness": brightness,
                    "transition": max(1, scene.get("interval", 30) - 1),
                    "shuffle": True,
                },
                scene.get("interval", 30),
            )
        else:
            group = scene.get("z2m_group")
            if (
                group
                and scene.get("z2m_scene_id")
                and group == self._z2m_group_for(scene)
                and scene.get("z2m_sync")
            ):
                covered = set(self.z2m.covered_lights(group, self.room_lights(area_id)))
                await self.z2m.recall_scene(group, scene["z2m_scene_id"])
                rest = {e: t for e, t in scene["lights"].items() if e not in covered} if covered else {}
                await apply_light_targets(self.hass, rest, transition)
            else:
                await apply_light_targets(self.hass, scene["lights"], transition)

        self.active[area_id] = scene_id
        self._save()
        self._notify()

    async def async_cycle(self, area_id: str) -> str | None:
        order = self._ordered_scene_ids(area_id)
        if not order:
            return None
        current = self.active.get(area_id)
        next_id = order[(order.index(current) + 1) % len(order)] if current in order else order[0]
        await self.async_activate(next_id)
        return next_id

    async def async_apply_preset_to_room(
        self, area_id: str, preset_id: str, brightness: int | None = None, shuffle: bool = False
    ) -> dict:
        preset = get_preset(self.preset_data, preset_id)
        lights = self.room_lights(area_id)
        targets = compute_preset_lights(self.hass, preset, lights, brightness, shuffle)
        for entity_id in lights:
            self.dynamic.stop_all_for_entity_id(entity_id)
        await apply_light_targets(self.hass, targets, 0.6)
        self._clear_active(area_id)
        return targets

    async def async_preview(self, targets: dict) -> None:
        for entity_id in targets:
            self.dynamic.stop_all_for_entity_id(entity_id)
        await apply_light_targets(self.hass, targets, 0.3)

    async def async_set_room_brightness(self, area_id: str, brightness_pct: float) -> None:
        """Scale on-lights relatively so the room average hits the target (like Hue)."""
        lights = self.room_lights(area_id)
        on = []
        for entity_id in lights:
            state = self.hass.states.get(entity_id)
            if state and state.state == "on":
                on.append((entity_id, state.attributes.get("brightness") or 255))
        target = max(1, min(255, round(brightness_pct * 2.55)))
        if not on:
            await self.hass.services.async_call(
                "light", "turn_on", {"entity_id": lights, "brightness": target}, blocking=True
            )
            return
        avg = sum(b for _, b in on) / len(on)
        factor = target / avg if avg else 1
        self._start_grace(area_id, 2)
        await asyncio.gather(
            *(
                self.hass.services.async_call(
                    "light",
                    "turn_on",
                    {"entity_id": e, "brightness": max(1, min(255, round(b * factor))), "transition": 0.3},
                    blocking=True,
                )
                for e, b in on
            )
        )

    # ------------------------------------------------------------------ active tracking

    def _retrack(self) -> None:
        if self._track_unsub:
            self._track_unsub()
            self._track_unsub = None
        entity_ids = set()
        for scene in self.scenes.values():
            entity_ids.update(scene["lights"].keys())
        for area_id in {s["area_id"] for s in self.scenes.values()}:
            entity_ids.update(self.room_lights(area_id))
        if entity_ids:
            self._track_unsub = async_track_state_change_event(
                self.hass, list(entity_ids), self._light_changed
            )

    def _matches(self, entity_id: str, target: dict, strict: bool = False) -> bool:
        state = self.hass.states.get(entity_id)
        if state is None or state.state in ("unavailable", "unknown"):
            return True  # don't let a missing lamp break the scene
        if target["state"] == "off":
            return state.state == "off"
        if state.state != "on":
            return False
        caps = light_capabilities(self.hass, entity_id)
        bri = state.attributes.get("brightness")
        if caps["brightness"] and target.get("brightness") and bri is not None:
            if abs(bri - target["brightness"]) > BRIGHTNESS_TOLERANCE:
                return False
        mode = state.attributes.get("color_mode")
        if target.get("xy") and caps["color"] and mode not in ("color_temp", None):
            xy = state.attributes.get("xy_color")
            if xy and _xy_distance(xy, target["xy"]) > XY_TOLERANCE:
                return False
        if target.get("color_temp_kelvin") and mode == "color_temp":
            kelvin = state.attributes.get("color_temp_kelvin")
            if kelvin and abs(kelvin - target["color_temp_kelvin"]) > KELVIN_TOLERANCE:
                return False
        if strict and target.get("xy") and caps["color"] and mode == "color_temp":
            return False
        return True

    def _clear_active(self, area_id: str) -> None:
        if area_id in self.active:
            self.active.pop(area_id)
            self._save()
            self._notify()

    @callback
    def _light_changed(self, event: Event) -> None:
        entity_id = event.data["entity_id"]
        now = time.monotonic()
        changed = False
        for area_id, scene_id in list(self.active.items()):
            scene = self.scenes.get(scene_id)
            if scene is None:
                self.active.pop(area_id)
                changed = True
                continue
            if self._grace_until.get(area_id, 0) > now:
                continue
            if entity_id not in scene["lights"] and entity_id not in self.room_lights(area_id):
                continue
            if scene.get("dynamic"):
                # Colours change continuously; only an all-off room ends the scene
                lights = [self.hass.states.get(e) for e in scene["lights"]]
                if all(s is None or s.state != "on" for s in lights):
                    self.active.pop(area_id)
                    changed = True
                continue
            target = scene["lights"].get(entity_id)
            if target is None:
                # A room light that isn't part of the scene was turned on
                new = event.data.get("new_state")
                if new is not None and new.state == "on":
                    self.active.pop(area_id)
                    changed = True
                continue
            if not self._matches(entity_id, target):
                self.active.pop(area_id)
                changed = True
        if changed:
            self._save()
            self._notify()
