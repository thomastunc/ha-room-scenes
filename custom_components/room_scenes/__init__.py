"""Room Scenes: Hue-style room scenes for Home Assistant (fork of Scene Presets)."""
from __future__ import annotations

import logging
import os

import homeassistant.helpers.config_validation as cv
import voluptuous as vol
from homeassistant.components.frontend import (
    add_extra_js_url,
    async_register_built_in_panel,
    async_remove_panel,
)
from homeassistant.components.http import HomeAssistantView, StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse
from homeassistant.helpers import entity_registry as er

from .const import (
    ASSETS_URL,
    ATTR_AREA_ID,
    ATTR_BRIGHTNESS,
    ATTR_BRIGHTNESS_PCT,
    ATTR_DYNAMIC_SCENE_ID,
    ATTR_INTERVAL,
    ATTR_ROOM_SCENE_ID,
    ATTR_SCENE_PRESET_ID,
    ATTR_SHUFFLE,
    ATTR_SMART_SHUFFLE,
    ATTR_TARGETS,
    ATTR_TRANSITION,
    CARD_JS_URL,
    CONF_Z2M_BASE_TOPIC,
    CONF_Z2M_ENABLED,
    DEFAULT_Z2M_BASE_TOPIC,
    DOMAIN,
    NAME,
    PANEL_JS_URL,
    PANEL_URL_PATH,
    PRESETS_URL,
    SERVICE_ACTIVATE_SCENE,
    SERVICE_APPLY_PRESET,
    SERVICE_CYCLE_SCENES,
    SERVICE_GET_DYNAMIC_SCENES,
    SERVICE_SET_ROOM_BRIGHTNESS,
    SERVICE_START_DYNAMIC_SCENE,
    SERVICE_STOP_ALL_DYNAMIC_SCENES,
    SERVICE_STOP_DYNAMIC_SCENE,
    SERVICE_STOP_DYNAMIC_SCENES_FOR_TARGETS,
)
from .file_utils import BASE_PATH, CUSTOM_ASSETS_PATH, VERSION, load_preset_data
from .manager import RoomSceneManager
from .presets import apply_preset
from .util import ensure_list, resolve_targets
from .websocket_api import async_setup_websocket_api

_LOGGER = logging.getLogger(__name__)

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)
PLATFORMS = [Platform.SCENE]

TARGETS = vol.Any(dict)

APPLY_PRESET_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_SCENE_PRESET_ID): cv.string,
        vol.Required(ATTR_TARGETS): TARGETS,
        vol.Optional(ATTR_BRIGHTNESS): vol.Coerce(int),
        vol.Optional(ATTR_TRANSITION, default=1): vol.Coerce(float),
        vol.Optional(ATTR_SHUFFLE, default=False): cv.boolean,
        vol.Optional(ATTR_SMART_SHUFFLE, default=False): cv.boolean,
    }
)
START_DYNAMIC_SCENE_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_SCENE_PRESET_ID): cv.string,
        vol.Required(ATTR_TARGETS): TARGETS,
        vol.Optional(ATTR_INTERVAL, default=60): vol.Coerce(int),
        vol.Optional(ATTR_BRIGHTNESS): vol.Coerce(int),
        vol.Optional(ATTR_TRANSITION, default=1): vol.Coerce(float),
    }
)
ACTIVATE_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_ROOM_SCENE_ID): cv.string,
        vol.Optional(ATTR_TRANSITION): vol.Coerce(float),
    }
)
CYCLE_SCHEMA = vol.Schema({vol.Required(ATTR_AREA_ID): cv.string})
ROOM_BRIGHTNESS_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_AREA_ID): cv.string,
        vol.Required(ATTR_BRIGHTNESS_PCT): vol.All(vol.Coerce(float), vol.Range(1, 100)),
    }
)


def _resolve(hass: HomeAssistant, targets: dict) -> list[str]:
    return resolve_targets(
        hass,
        ensure_list(targets.get("entity_id")),
        ensure_list(targets.get("device_id")),
        ensure_list(targets.get("area_id")),
        ensure_list(targets.get("floor_id")),
        ensure_list(targets.get("label_id")),
    )


class PresetDataView(HomeAssistantView):
    url = PRESETS_URL
    name = f"{DOMAIN}:presets"
    requires_auth = False

    def __init__(self, data: dict) -> None:
        self.data = data

    async def get(self, request):
        return self.json(self.data)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    return True


def _register_services(hass: HomeAssistant, manager: RoomSceneManager) -> None:
    async def apply_preset_service(call: ServiceCall) -> None:
        await apply_preset(
            hass,
            manager.preset_data,
            call.data[ATTR_SCENE_PRESET_ID],
            _resolve(hass, call.data[ATTR_TARGETS]),
            call.data[ATTR_TRANSITION],
            call.data[ATTR_SHUFFLE],
            call.data[ATTR_SMART_SHUFFLE],
            call.data.get(ATTR_BRIGHTNESS),
        )

    async def stop_for_targets(call: ServiceCall):
        for entity_id in _resolve(hass, call.data[ATTR_TARGETS]):
            manager.dynamic.stop_all_for_entity_id(entity_id)
        return True

    async def start_dynamic_scene(call: ServiceCall):
        await stop_for_targets(call)
        return manager.dynamic.create_new(
            hass,
            {
                "preset_id": call.data[ATTR_SCENE_PRESET_ID],
                "light_entity_ids": _resolve(hass, call.data[ATTR_TARGETS]),
                "brightness": call.data.get(ATTR_BRIGHTNESS),
                "transition": call.data[ATTR_TRANSITION],
                "shuffle": True,
            },
            call.data[ATTR_INTERVAL],
        )

    async def stop_dynamic_scene(call: ServiceCall) -> None:
        manager.dynamic.delete_by_id(call.data[ATTR_DYNAMIC_SCENE_ID])

    async def stop_all_dynamic_scenes(call: ServiceCall) -> None:
        manager.dynamic.stop_all()

    async def get_dynamic_scenes(call: ServiceCall):
        return manager.dynamic.get_all_as_dict()

    async def activate_scene(call: ServiceCall) -> None:
        scene_id = call.data[ATTR_ROOM_SCENE_ID]
        if scene_id.startswith("scene."):
            entry = er.async_get(hass).async_get(scene_id)
            if entry and entry.unique_id.startswith(f"{DOMAIN}_"):
                scene_id = entry.unique_id.removeprefix(f"{DOMAIN}_")
        await manager.async_activate(scene_id, call.data.get(ATTR_TRANSITION))

    async def cycle_scenes(call: ServiceCall):
        return {"room_scene_id": await manager.async_cycle(call.data[ATTR_AREA_ID])}

    async def set_room_brightness(call: ServiceCall) -> None:
        await manager.async_set_room_brightness(call.data[ATTR_AREA_ID], call.data[ATTR_BRIGHTNESS_PCT])

    reg = hass.services.async_register
    reg(DOMAIN, SERVICE_APPLY_PRESET, apply_preset_service, schema=APPLY_PRESET_SCHEMA)
    reg(DOMAIN, SERVICE_GET_DYNAMIC_SCENES, get_dynamic_scenes, supports_response=SupportsResponse.ONLY)
    reg(
        DOMAIN,
        SERVICE_START_DYNAMIC_SCENE,
        start_dynamic_scene,
        schema=START_DYNAMIC_SCENE_SCHEMA,
        supports_response=SupportsResponse.OPTIONAL,
    )
    reg(DOMAIN, SERVICE_STOP_DYNAMIC_SCENE, stop_dynamic_scene, schema=vol.Schema({vol.Required(ATTR_DYNAMIC_SCENE_ID): cv.string}))
    reg(
        DOMAIN,
        SERVICE_STOP_DYNAMIC_SCENES_FOR_TARGETS,
        stop_for_targets,
        schema=vol.Schema({vol.Required(ATTR_TARGETS): TARGETS}),
    )
    reg(DOMAIN, SERVICE_STOP_ALL_DYNAMIC_SCENES, stop_all_dynamic_scenes)
    reg(DOMAIN, SERVICE_ACTIVATE_SCENE, activate_scene, schema=ACTIVATE_SCHEMA)
    reg(DOMAIN, SERVICE_CYCLE_SCENES, cycle_scenes, schema=CYCLE_SCHEMA, supports_response=SupportsResponse.OPTIONAL)
    reg(DOMAIN, SERVICE_SET_ROOM_BRIGHTNESS, set_room_brightness, schema=ROOM_BRIGHTNESS_SCHEMA)


async def _register_frontend(hass: HomeAssistant, preset_data: dict) -> None:
    domain_data = hass.data[DOMAIN]
    if domain_data.get("frontend_registered"):
        return
    frontend = os.path.join(BASE_PATH, "frontend")
    paths = [
        StaticPathConfig(PANEL_JS_URL, os.path.join(frontend, "room_scenes_panel.js"), True),
        StaticPathConfig(CARD_JS_URL, os.path.join(frontend, "room_scenes_card.js"), True),
        StaticPathConfig(f"{ASSETS_URL}/iconset.js", os.path.join(BASE_PATH, "res", "iconset.js"), True),
        StaticPathConfig(f"{ASSETS_URL}/img", os.path.join(BASE_PATH, "assets"), True),
        StaticPathConfig(f"{ASSETS_URL}/custom", CUSTOM_ASSETS_PATH, False),
    ]
    await hass.http.async_register_static_paths(paths)
    hass.http.register_view(PresetDataView(preset_data))
    add_extra_js_url(hass, f"{ASSETS_URL}/iconset.js?v={VERSION}")
    add_extra_js_url(hass, f"{CARD_JS_URL}?v={VERSION}")
    domain_data["frontend_registered"] = True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    domain_data = hass.data.setdefault(DOMAIN, {})
    preset_data = await hass.async_add_executor_job(load_preset_data)

    options = {**entry.data, **entry.options}
    z2m_topic = (
        options.get(CONF_Z2M_BASE_TOPIC, DEFAULT_Z2M_BASE_TOPIC)
        if options.get(CONF_Z2M_ENABLED, True)
        else None
    )
    manager = RoomSceneManager(hass, preset_data, z2m_topic)
    await manager.async_load()
    domain_data["manager"] = manager

    await _register_frontend(hass, preset_data)
    async_register_built_in_panel(
        hass,
        component_name="custom",
        sidebar_title=NAME,
        sidebar_icon="mdi:lightbulb-group",
        frontend_url_path=PANEL_URL_PATH,
        require_admin=False,
        config={
            "_panel_custom": {
                "name": "room-scenes-panel",
                "module_url": f"{PANEL_JS_URL}?v={VERSION}",
                "embed_iframe": False,
                "trust_external": False,
            }
        },
        update=True,
    )

    if not domain_data.get("ws_registered"):
        async_setup_websocket_api(hass)
        domain_data["ws_registered"] = True
    _register_services(hass, manager)

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_reload))
    return True


async def _async_reload(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if ok:
        manager: RoomSceneManager = hass.data[DOMAIN].pop("manager")
        manager.async_unload()
        async_remove_panel(hass, PANEL_URL_PATH)
        for service in list(hass.services.async_services_for_domain(DOMAIN)):
            hass.services.async_remove(DOMAIN, service)
    return ok
