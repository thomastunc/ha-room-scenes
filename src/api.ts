export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
}

export interface Hass {
  states: Record<string, HassEntity>;
  language?: string;
  locale?: { language: string };
  user?: { is_admin: boolean };
  themes?: { darkMode?: boolean };
  callService(domain: string, service: string, data?: Record<string, any>): Promise<any>;
  callWS<T = any>(msg: Record<string, any>): Promise<T>;
  connection: {
    subscribeMessage<T = any>(cb: (msg: T) => void, msg: Record<string, any>): Promise<() => void>;
  };
}

export interface LightTarget {
  state: "on" | "off";
  brightness?: number | null;
  xy?: [number, number] | null;
  color_temp_kelvin?: number | null;
}

export type LightTargets = Record<string, LightTarget>;

export interface PaletteEntry {
  xy?: [number, number];
  kelvin?: number;
  brightness?: number;
}

export interface RoomScene {
  id: string;
  area_id: string;
  name: string;
  preset_id?: string | null;
  icon?: string | null;
  lights: LightTargets;
  dynamic: boolean;
  interval: number;
  transition: number;
  z2m_sync: boolean;
  z2m_scene_id?: number;
  palette: PaletteEntry[];
}

export interface Room {
  area_id: string;
  name: string;
  icon: string | null;
  picture: string | null;
  floor_id: string | null;
  lights: string[];
  z2m_group: string | null;
  z2m_suggestion?: string | null;
  z2m_covered?: string[];
  scene_order: string[];
}

export interface RoomScenesData {
  rooms: Room[];
  scenes: RoomScene[];
  active: Record<string, string>;
  dynamic: any[];
  z2m: { enabled: boolean; available: boolean; groups: string[]; status: Record<string, string> };
}

export interface Preset {
  id: string;
  categoryId: string;
  name: string;
  img?: string;
  bri: number;
  custom?: boolean;
  lights: { x: number; y: number }[];
}

export interface PresetData {
  categories: { id: string; name: string; custom?: boolean }[];
  presets: Preset[];
}

export const ASSETS = "/room_scenes/assets";

export function presetImage(p: Preset): string | null {
  if (!p.img) return null;
  return p.custom ? `${ASSETS}/custom/${p.img}` : `${ASSETS}/img/${p.img}`;
}

let presetPromise: Promise<PresetData> | null = null;
export function loadPresets(): Promise<PresetData> {
  if (!presetPromise) {
    presetPromise = fetch(`${ASSETS}/presets.json`).then((r) => r.json());
  }
  return presetPromise;
}

type Listener = (d: RoomScenesData) => void;

/** One shared subscription per page, used by the panel and every card. */
class DataHub {
  data: RoomScenesData | null = null;
  private listeners = new Set<Listener>();
  private unsub: Promise<() => void> | null = null;

  subscribe(hass: Hass, cb: Listener): () => void {
    this.listeners.add(cb);
    if (this.data) cb(this.data);
    if (!this.unsub) {
      this.unsub = hass.connection.subscribeMessage<RoomScenesData>(
        (d) => {
          this.data = d;
          this.listeners.forEach((l) => l(d));
        },
        { type: "room_scenes/subscribe" }
      );
      this.unsub.catch(() => {
        this.unsub = null;
      });
    }
    return () => {
      this.listeners.delete(cb);
      if (this.listeners.size === 0 && this.unsub) {
        const u = this.unsub;
        this.unsub = null;
        this.data = null;
        u.then((f) => f()).catch(() => undefined);
      }
    };
  }
}

const w = window as any;
export const hub: DataHub = w.__roomScenesHub || (w.__roomScenesHub = new DataHub());

export const ws = {
  activate: (hass: Hass, scene_id: string) => hass.callWS({ type: "room_scenes/activate", scene_id }),
  cycle: (hass: Hass, area_id: string) => hass.callWS({ type: "room_scenes/cycle", area_id }),
  save: (hass: Hass, scene: Partial<RoomScene>) =>
    hass.callWS<RoomScene>({ type: "room_scenes/save_scene", scene }),
  remove: (hass: Hass, scene_id: string) => hass.callWS({ type: "room_scenes/delete_scene", scene_id }),
  applyPreset: (hass: Hass, area_id: string, preset_id: string, shuffle = false) =>
    hass.callWS<{ lights: LightTargets }>({ type: "room_scenes/apply_preset", area_id, preset_id, shuffle }),
  preview: (hass: Hass, lights: LightTargets) => hass.callWS({ type: "room_scenes/preview", lights }),
  roomSettings: (hass: Hass, area_id: string, settings: { z2m_group?: string | null; scene_order?: string[] }) =>
    hass.callWS({ type: "room_scenes/room_settings", area_id, ...settings }),
  roomBrightness: (hass: Hass, area_id: string, brightness_pct: number) =>
    hass.callWS({ type: "room_scenes/room_brightness", area_id, brightness_pct }),
  storeOnLamps: (hass: Hass, scene_id: string) => hass.callWS({ type: "room_scenes/store_on_lamps", scene_id }),
};
