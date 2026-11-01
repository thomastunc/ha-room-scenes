"""Websocket commands used by the panel and the Lovelace card."""
from __future__ import annotations

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect

from .const import DOMAIN, SIGNAL_DATA_UPDATED

LIGHT_TARGETS = vol.Schema({str: dict})


def _manager(hass):
    return hass.data[DOMAIN]["manager"]


def _wrap_errors(func):
    async def wrapper(hass, connection, msg):
        try:
            await func(hass, connection, msg)
        except vol.Invalid as err:
            connection.send_error(msg["id"], "invalid", str(err))

    return wrapper


@callback
def async_setup_websocket_api(hass: HomeAssistant) -> None:
    for command in (
        ws_subscribe,
        ws_get_data,
        ws_save_scene,
        ws_delete_scene,
        ws_activate,
        ws_cycle,
        ws_apply_preset,
        ws_preview,
        ws_room_settings,
        ws_room_brightness,
        ws_store_on_lamps,
    ):
        websocket_api.async_register_command(hass, command)


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/subscribe"})
@callback
def ws_subscribe(hass, connection, msg):
    manager = _manager(hass)

    @callback
    def send() -> None:
        connection.send_message(websocket_api.event_message(msg["id"], manager.get_data()))

    connection.subscriptions[msg["id"]] = async_dispatcher_connect(hass, SIGNAL_DATA_UPDATED, send)
    connection.send_result(msg["id"])
    send()


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/get_data"})
@callback
def ws_get_data(hass, connection, msg):
    connection.send_result(msg["id"], _manager(hass).get_data())


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/save_scene", vol.Required("scene"): dict}
)
@websocket_api.require_admin
@websocket_api.async_response
@_wrap_errors
async def ws_save_scene(hass, connection, msg):
    scene = await _manager(hass).async_save_scene(msg["scene"])
    connection.send_result(msg["id"], scene)


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/delete_scene", vol.Required("scene_id"): str}
)
@websocket_api.require_admin
@websocket_api.async_response
@_wrap_errors
async def ws_delete_scene(hass, connection, msg):
    await _manager(hass).async_delete_scene(msg["scene_id"])
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/activate", vol.Required("scene_id"): str}
)
@websocket_api.async_response
@_wrap_errors
async def ws_activate(hass, connection, msg):
    await _manager(hass).async_activate(msg["scene_id"])
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/cycle", vol.Required("area_id"): str}
)
@websocket_api.async_response
@_wrap_errors
async def ws_cycle(hass, connection, msg):
    scene_id = await _manager(hass).async_cycle(msg["area_id"])
    connection.send_result(msg["id"], {"scene_id": scene_id})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/apply_preset",
        vol.Required("area_id"): str,
        vol.Required("preset_id"): str,
        vol.Optional("brightness"): vol.Any(None, int),
        vol.Optional("shuffle", default=False): bool,
    }
)
@websocket_api.async_response
@_wrap_errors
async def ws_apply_preset(hass, connection, msg):
    targets = await _manager(hass).async_apply_preset_to_room(
        msg["area_id"], msg["preset_id"], msg.get("brightness"), msg["shuffle"]
    )
    connection.send_result(msg["id"], {"lights": targets})


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/preview", vol.Required("lights"): LIGHT_TARGETS}
)
@websocket_api.async_response
@_wrap_errors
async def ws_preview(hass, connection, msg):
    await _manager(hass).async_preview(msg["lights"])
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/room_settings",
        vol.Required("area_id"): str,
        vol.Optional("z2m_group"): vol.Any(None, str),
        vol.Optional("scene_order"): [str],
    }
)
@websocket_api.require_admin
@callback
def ws_room_settings(hass, connection, msg):
    settings = {k: msg[k] for k in ("z2m_group", "scene_order") if k in msg}
    _manager(hass).set_room_settings(msg["area_id"], settings)
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/room_brightness",
        vol.Required("area_id"): str,
        vol.Required("brightness_pct"): vol.All(vol.Coerce(float), vol.Range(1, 100)),
    }
)
@websocket_api.async_response
@_wrap_errors
async def ws_room_brightness(hass, connection, msg):
    await _manager(hass).async_set_room_brightness(msg["area_id"], msg["brightness_pct"])
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/store_on_lamps", vol.Required("scene_id"): str}
)
@websocket_api.require_admin
@websocket_api.async_response
@_wrap_errors
async def ws_store_on_lamps(hass, connection, msg):
    await _manager(hass)._async_store_on_lamps(msg["scene_id"])
    connection.send_result(msg["id"])
