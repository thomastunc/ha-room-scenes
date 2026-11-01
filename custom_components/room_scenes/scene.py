"""Expose every room scene as a regular Home Assistant scene entity."""
from __future__ import annotations

from typing import Any

from homeassistant.components.scene import Scene
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN, SIGNAL_DATA_UPDATED, SIGNAL_SCENE_ADDED, SIGNAL_SCENE_REMOVED
from .manager import RoomSceneManager


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    manager: RoomSceneManager = hass.data[DOMAIN]["manager"]
    entities: dict[str, RoomSceneEntity] = {}

    @callback
    def add(scene_id: str) -> None:
        if scene_id in entities or scene_id not in manager.scenes:
            return
        entities[scene_id] = RoomSceneEntity(manager, scene_id)
        async_add_entities([entities[scene_id]])

    @callback
    def remove(scene_id: str) -> None:
        entity = entities.pop(scene_id, None)
        if entity is None:
            return
        registry = er.async_get(hass)
        if entity.entity_id and registry.async_get(entity.entity_id):
            registry.async_remove(entity.entity_id)
        else:
            hass.async_create_task(entity.async_remove())

    for scene_id in list(manager.scenes):
        add(scene_id)

    entry.async_on_unload(async_dispatcher_connect(hass, SIGNAL_SCENE_ADDED, add))
    entry.async_on_unload(async_dispatcher_connect(hass, SIGNAL_SCENE_REMOVED, remove))


class RoomSceneEntity(Scene):
    _attr_should_poll = False
    _attr_has_entity_name = False

    def __init__(self, manager: RoomSceneManager, scene_id: str) -> None:
        self.manager = manager
        self.scene_id = scene_id
        self._attr_unique_id = f"{DOMAIN}_{scene_id}"
        self._attr_icon = "mdi:palette"
        self._sync_attrs()

    @property
    def scene(self) -> dict:
        return self.manager.scenes.get(self.scene_id, {})

    def _sync_attrs(self) -> None:
        scene = self.scene
        area = ar.async_get(self.manager.hass).async_get_area(scene.get("area_id", ""))
        room = area.name if area else ""
        self._attr_name = f"{room} {scene.get('name', '')}".strip()
        if scene.get("icon"):
            self._attr_icon = scene["icon"]

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        scene = self.scene
        return {
            "room_scene_id": self.scene_id,
            "area_id": scene.get("area_id"),
            "scene_name": scene.get("name"),
            "active": self.manager.active.get(scene.get("area_id")) == self.scene_id,
            "dynamic": scene.get("dynamic", False),
            "preset_id": scene.get("preset_id"),
            "palette": scene.get("palette", []),
            "zigbee_scene_id": scene.get("z2m_scene_id"),
        }

    async def async_added_to_hass(self) -> None:
        registry = er.async_get(self.hass)
        entry = registry.async_get(self.entity_id)
        if entry and entry.area_id is None and self.scene.get("area_id"):
            registry.async_update_entity(self.entity_id, area_id=self.scene["area_id"])

        @callback
        def updated() -> None:
            if self.scene_id not in self.manager.scenes:
                return
            self._sync_attrs()
            self.async_write_ha_state()

        self.async_on_remove(async_dispatcher_connect(self.hass, SIGNAL_DATA_UPDATED, updated))

    async def async_activate(self, **kwargs: Any) -> None:
        await self.manager.async_activate(self.scene_id, kwargs.get("transition"))
