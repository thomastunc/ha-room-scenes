"""Zigbee2MQTT integration: store room scenes on the lamps as native Zigbee scenes.

Storing works by first putting every lamp in the desired state through Home Assistant,
then sending a Zigbee "store scene" to the Z2M group. The lamps capture their own
current state, so no per-lamp payloads or numeric group IDs are needed.
"""
from __future__ import annotations

import json
import logging
import re
from collections.abc import Callable

from homeassistant.const import EVENT_COMPONENT_LOADED
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er

_LOGGER = logging.getLogger(__name__)

IEEE_RE = re.compile(r"^(0x[0-9a-fA-F]{16})")


class Z2MBridge:
    def __init__(self, hass: HomeAssistant, base_topic: str, on_change: Callable[[], None]):
        self.hass = hass
        self.base_topic = base_topic.rstrip("/")
        self.on_change = on_change
        self.groups: list[dict] = []
        self._unsub = None
        self._unsub_loaded = None
        self.available = False

    async def async_start(self) -> None:
        if "mqtt" not in self.hass.config.components:
            _LOGGER.info("MQTT not loaded yet; Zigbee2MQTT scene sync waits for it")

            @callback
            def _component_loaded(event) -> None:
                if event.data.get("component") == "mqtt" and self._unsub_loaded:
                    self._unsub_loaded()
                    self._unsub_loaded = None
                    self.hass.async_create_task(self.async_start())

            self._unsub_loaded = self.hass.bus.async_listen(EVENT_COMPONENT_LOADED, _component_loaded)
            return
        from homeassistant.components import mqtt

        try:
            await mqtt.async_wait_for_mqtt_client(self.hass)
        except Exception:  # noqa: BLE001
            return

        @callback
        def _groups_received(msg) -> None:
            try:
                payload = json.loads(msg.payload)
            except (ValueError, TypeError):
                return
            if isinstance(payload, list):
                self.groups = payload
                self.available = True
                self.on_change()

        self._unsub = await mqtt.async_subscribe(
            self.hass, f"{self.base_topic}/bridge/groups", _groups_received
        )

    def stop(self) -> None:
        if self._unsub_loaded:
            self._unsub_loaded()
            self._unsub_loaded = None
        if self._unsub:
            self._unsub()
            self._unsub = None

    def group_names(self) -> list[str]:
        return sorted(g.get("friendly_name") for g in self.groups if g.get("friendly_name"))

    def group_members(self, friendly_name: str) -> set[str]:
        for group in self.groups:
            if group.get("friendly_name") == friendly_name:
                return {
                    m.get("ieee_address", "").lower()
                    for m in group.get("members", [])
                    if m.get("ieee_address")
                }
        return set()

    def entity_ieee(self, entity_id: str) -> str | None:
        entry = er.async_get(self.hass).async_get(entity_id)
        if entry is None or entry.platform != "mqtt" or not entry.unique_id:
            return None
        match = IEEE_RE.match(entry.unique_id)
        return match.group(1).lower() if match else None

    def covered_lights(self, friendly_name: str | None, light_entity_ids: list[str]) -> list[str]:
        """Return the room lights that are members of the given Z2M group."""
        if not friendly_name:
            return []
        members = self.group_members(friendly_name)
        return [e for e in light_entity_ids if (ieee := self.entity_ieee(e)) and ieee in members]

    def suggest_group(self, light_entity_ids: list[str]) -> str | None:
        """Suggest the Z2M group whose members best match a room's lights."""
        ieees = {i for e in light_entity_ids if (i := self.entity_ieee(e))}
        if not ieees:
            return None
        best, best_score = None, 0.0
        for group in self.groups:
            members = {m.get("ieee_address", "").lower() for m in group.get("members", [])}
            if not members or not members <= ieees:
                continue
            score = len(members) / len(ieees)
            if score > best_score:
                best, best_score = group.get("friendly_name"), score
        return best

    async def _publish(self, group: str, payload: dict) -> None:
        from homeassistant.components import mqtt

        await mqtt.async_publish(self.hass, f"{self.base_topic}/{group}/set", json.dumps(payload))

    async def store_scene(self, group: str, scene_id: int, name: str) -> None:
        await self._publish(group, {"scene_store": {"ID": scene_id, "name": name}})

    async def recall_scene(self, group: str, scene_id: int) -> None:
        await self._publish(group, {"scene_recall": scene_id})

    async def remove_scene(self, group: str, scene_id: int) -> None:
        await self._publish(group, {"scene_remove": scene_id})
