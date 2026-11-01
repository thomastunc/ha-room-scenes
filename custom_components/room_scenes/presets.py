import asyncio
import logging
import random

import voluptuous as vol
from homeassistant.core import HomeAssistant

from .color_management import (
    get_next_color,
    get_next_smart_random_color,
    get_random_color,
    get_randomized_colors,
)
from .color_temperature import find_closest_ct_match

_LOGGER = logging.getLogger(__name__)

COLOR_MODES = ("xy", "hs", "rgb", "rgbw", "rgbww")


def light_capabilities(hass: HomeAssistant, entity_id: str) -> dict:
    state = hass.states.get(entity_id)
    modes = (state.attributes.get("supported_color_modes") or []) if state else []
    return {
        "color": any(m in modes for m in COLOR_MODES),
        "color_temp": "color_temp" in modes,
        "brightness": any(m != "onoff" for m in modes),
        "min_kelvin": state.attributes.get("min_color_temp_kelvin", 2000) if state else 2000,
        "max_kelvin": state.attributes.get("max_color_temp_kelvin", 6500) if state else 6500,
    }


def get_preset(preset_data: dict, preset_id: str) -> dict:
    wanted = preset_id.casefold()
    for preset in preset_data.get("presets", []):
        if preset.get("id") == preset_id or str(preset.get("name", "")).casefold() == wanted:
            return preset
    raise vol.Invalid(f"Preset '{preset_id}' not found.")


def compute_preset_lights(
    hass: HomeAssistant,
    preset: dict,
    light_entity_ids: list[str],
    brightness_override: int | None = None,
    shuffle: bool = False,
) -> dict:
    """Compute a per-light target map for a preset (deterministic unless shuffle)."""
    brightness = brightness_override or preset.get("bri", 255)
    colors = [(light["x"], light["y"]) for light in preset["lights"]]
    ordered = sorted(light_entity_ids)
    if shuffle:
        assigned = get_randomized_colors(colors, len(ordered))
    else:
        assigned = [get_next_color(i, colors) for i in range(len(ordered))]

    result = {}
    for entity_id, xy in zip(ordered, assigned):
        caps = light_capabilities(hass, entity_id)
        target = {"state": "on", "brightness": brightness}
        if caps["color"]:
            target["xy"] = [round(xy[0], 4), round(xy[1], 4)]
        elif caps["color_temp"]:
            target["color_temp_kelvin"] = find_closest_ct_match(xy[0], xy[1])
        result[entity_id] = target
    return result


def build_turn_on_params(hass: HomeAssistant, entity_id: str, target: dict, transition) -> dict:
    caps = light_capabilities(hass, entity_id)
    params = {"entity_id": entity_id}
    if transition is not None:
        params["transition"] = transition
    if caps["brightness"] and target.get("brightness") is not None:
        params["brightness"] = max(1, min(255, int(target["brightness"])))
    xy = target.get("xy")
    kelvin = target.get("color_temp_kelvin")
    if xy and caps["color"]:
        params["xy_color"] = tuple(xy)
    elif xy and caps["color_temp"]:
        params["color_temp_kelvin"] = find_closest_ct_match(xy[0], xy[1])
    elif kelvin and (caps["color_temp"] or caps["color"]):
        params["color_temp_kelvin"] = int(kelvin)
    return params


async def apply_light_targets(
    hass: HomeAssistant, targets: dict, transition=0.4, context=None
) -> None:
    """Apply a {entity_id: target} map in parallel."""
    tasks = []
    for entity_id, target in targets.items():
        if hass.states.get(entity_id) is None:
            continue
        if target.get("state") == "off":
            data = {"entity_id": entity_id}
            if transition is not None:
                data["transition"] = transition
            tasks.append(
                hass.services.async_call("light", "turn_off", data, blocking=True, context=context)
            )
        else:
            tasks.append(
                hass.services.async_call(
                    "light",
                    "turn_on",
                    build_turn_on_params(hass, entity_id, target, transition),
                    blocking=True,
                    context=context,
                )
            )
    if tasks:
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for res in results:
            if isinstance(res, Exception):
                _LOGGER.warning("Applying light target failed: %s", res)


async def apply_preset(
    hass,
    preset_data,
    preset_id,
    light_entity_ids,
    transition,
    shuffle,
    smart_shuffle,
    brightness_override=None,
):
    """Upstream-compatible preset application (used by services and dynamic scenes)."""
    preset = get_preset(preset_data, preset_id)
    brightness = brightness_override if brightness_override else preset.get("bri", 255)
    preset_colors = [(light["x"], light["y"]) for light in preset["lights"]]
    light_entity_ids = list(light_entity_ids)

    randomized_colors = None
    if shuffle:
        randomized_colors = get_randomized_colors(preset_colors, len(light_entity_ids))
        random.shuffle(light_entity_ids)

    targets = {}
    for index, entity_id in enumerate(light_entity_ids):
        state = hass.states.get(entity_id)
        if not state:
            continue
        if shuffle:
            current = state.attributes.get("xy_color")
            if current is not None and smart_shuffle:
                xy = get_next_smart_random_color(current, preset_colors)
            elif randomized_colors is not None and index < len(randomized_colors):
                xy = randomized_colors[index]
            else:
                xy = get_random_color(preset_colors)
        else:
            xy = get_next_color(index, preset_colors)
        targets[entity_id] = {"state": "on", "brightness": brightness, "xy": list(xy)}

    await apply_light_targets(hass, targets, transition)
