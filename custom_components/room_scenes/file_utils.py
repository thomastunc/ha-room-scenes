import json
import logging
import os

_LOGGER = logging.getLogger(__name__)

BASE_PATH = os.path.dirname(os.path.realpath(__file__))

with open(os.path.join(BASE_PATH, "manifest.json")) as _f:
    MANIFEST = json.load(_f)
VERSION = MANIFEST["version"]

CUSTOM_PATH = os.path.join(BASE_PATH, "userdata", "custom")
CUSTOM_ASSETS_PATH = os.path.join(CUSTOM_PATH, "assets")


def load_preset_data() -> dict:
    """Load bundled presets plus optional custom presets (blocking, run in executor)."""
    os.makedirs(CUSTOM_ASSETS_PATH, exist_ok=True)

    with open(os.path.join(BASE_PATH, "presets.json")) as file:
        data = json.load(file)

    custom_presets_path = os.path.join(CUSTOM_PATH, "presets.json")
    if os.path.exists(custom_presets_path):
        try:
            with open(custom_presets_path) as file:
                custom = json.load(file)
            data["presets"].extend({**d, "custom": True} for d in custom.get("presets", []))
            data["categories"].extend({**d, "custom": True} for d in custom.get("categories", []))
            _LOGGER.info("Custom presets loaded")
        except (json.JSONDecodeError, OSError) as err:
            _LOGGER.error("Error loading custom presets: %s", err)

    return data
