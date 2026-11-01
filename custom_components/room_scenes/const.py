DOMAIN = "room_scenes"
NAME = "Room Scenes"

PANEL_URL_PATH = "room-scenes"
PANEL_JS_URL = "/room_scenes/room_scenes_panel.js"
CARD_JS_URL = "/room_scenes/room_scenes_card.js"
ASSETS_URL = "/room_scenes/assets"
PRESETS_URL = f"{ASSETS_URL}/presets.json"

STORAGE_KEY = f"{DOMAIN}.data"
STORAGE_VERSION = 1

SIGNAL_DATA_UPDATED = f"{DOMAIN}_data_updated"
SIGNAL_SCENE_ADDED = f"{DOMAIN}_scene_added"
SIGNAL_SCENE_REMOVED = f"{DOMAIN}_scene_removed"

CONF_Z2M_ENABLED = "z2m_enabled"
CONF_Z2M_BASE_TOPIC = "z2m_base_topic"
DEFAULT_Z2M_BASE_TOPIC = "zigbee2mqtt"

# Upstream (scene_presets) services, kept for compatibility
SERVICE_APPLY_PRESET = "apply_preset"
SERVICE_START_DYNAMIC_SCENE = "start_dynamic_scene"
SERVICE_STOP_DYNAMIC_SCENE = "stop_dynamic_scene"
SERVICE_STOP_ALL_DYNAMIC_SCENES = "stop_all_dynamic_scenes"
SERVICE_STOP_DYNAMIC_SCENES_FOR_TARGETS = "stop_dynamic_scenes_for_targets"
SERVICE_GET_DYNAMIC_SCENES = "get_dynamic_scenes"

# Room scene services
SERVICE_ACTIVATE_SCENE = "activate_scene"
SERVICE_CYCLE_SCENES = "cycle_scenes"
SERVICE_SET_ROOM_BRIGHTNESS = "set_room_brightness"

ATTR_SCENE_PRESET_ID = "preset_id"
ATTR_TARGETS = "targets"
ATTR_BRIGHTNESS = "brightness"
ATTR_BRIGHTNESS_PCT = "brightness_pct"
ATTR_TRANSITION = "transition"
ATTR_SHUFFLE = "shuffle"
ATTR_SMART_SHUFFLE = "smart_shuffle"
ATTR_INTERVAL = "interval"
ATTR_DYNAMIC_SCENE_ID = "id"
ATTR_AREA_ID = "area_id"
ATTR_ROOM_SCENE_ID = "room_scene_id"

# Tolerances for detecting that a room no longer matches its active scene
BRIGHTNESS_TOLERANCE = 12
XY_TOLERANCE = 0.04
KELVIN_TOLERANCE = 250
ACTIVATION_GRACE_SECONDS = 4
