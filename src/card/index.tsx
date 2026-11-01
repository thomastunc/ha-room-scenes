import { render } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import type { Hass, PresetData, RoomScenesData } from "../api";
import { hub, loadPresets, ws } from "../api";
import { RoomCard, SceneTile } from "../components";
import { strings } from "../i18n";
import { baseStyles, cardStyles } from "../styles";

interface CardConfig {
  type: string;
  area: string;
  show_scenes?: boolean;
  tap_action?: "open_panel" | "none";
}

function CardView(props: { hass: Hass; config: CardConfig }) {
  const { hass, config } = props;
  const t = strings(hass);
  const [data, setData] = useState<RoomScenesData | null>(hub.data);
  const [presets, setPresets] = useState<PresetData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => hub.subscribe(hass, setData), []);
  useEffect(() => {
    loadPresets().then(setPresets);
  }, []);
  const presetById = useMemo(
    () => Object.fromEntries((presets?.presets || []).map((p) => [p.id, p])),
    [presets]
  );

  if (!data) return <div class="rs-card-empty">{t.loading}</div>;
  const room = data.rooms.find((r) => r.area_id === config.area);
  if (!room) return <div class="rs-card-empty">Room Scenes: area “{config.area}” has no lights</div>;
  const scenes = room.scene_order.map((id) => data.scenes.find((s) => s.id === id)!).filter(Boolean);
  const activeId = data.active[room.area_id];
  const anyOn = room.lights.some((id) => hass.states[id]?.state === "on");
  const dark = hass.themes?.darkMode ?? true;

  const open = () => {
    if (config.tap_action === "none") return;
    history.pushState(null, "", `/room-scenes/${room.area_id}`);
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
  };

  return (
    <div class={`rs-root ${dark ? "" : "light"}`}>
      <RoomCard hass={hass} room={room} t={t} activeScene={scenes.find((s) => s.id === activeId)} onOpen={open} />
      {config.show_scenes !== false && scenes.length > 0 && (
        <div class="rs-scene-row">
          {scenes.map((s) => (
            <SceneTile
              scene={s}
              preset={s.preset_id ? presetById[s.preset_id] : undefined}
              active={s.id === activeId && anyOn}
              busy={busy === s.id}
              onClick={async () => {
                setBusy(s.id);
                try {
                  await ws.activate(hass, s.id);
                } finally {
                  setBusy(null);
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

class RoomScenesCard extends HTMLElement {
  private _hass?: Hass;
  private _config?: CardConfig;
  private mount?: HTMLElement;

  static getConfigForm() {
    return {
      schema: [
        { name: "area", required: true, selector: { area: {} } },
        { name: "show_scenes", default: true, selector: { boolean: {} } },
        {
          name: "tap_action",
          default: "open_panel",
          selector: { select: { mode: "dropdown", options: ["open_panel", "none"] } },
        },
      ],
    };
  }

  static getStubConfig(hass: Hass) {
    const data = hub.data;
    return { area: data?.rooms[0]?.area_id ?? "", show_scenes: true };
  }

  setConfig(config: CardConfig) {
    if (!config.area) throw new Error("Please select an area");
    this._config = config;
    this.update();
  }

  set hass(hass: Hass) {
    this._hass = hass;
    this.update();
  }

  getCardSize() {
    return this._config?.show_scenes === false ? 2 : 4;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: this._config?.show_scenes === false ? 2 : 4, min_rows: 2 };
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      const root = this.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = baseStyles + cardStyles;
      const card = document.createElement("ha-card");
      this.mount = document.createElement("div");
      card.append(this.mount);
      root.append(style, card);
    }
    this.update();
  }

  disconnectedCallback() {
    if (this.mount) render(null, this.mount);
  }

  private update() {
    if (!this.mount || !this._hass || !this._config) return;
    render(<CardView hass={this._hass} config={this._config} />, this.mount);
  }
}

if (!customElements.get("room-scenes-card")) {
  customElements.define("room-scenes-card", RoomScenesCard);
  (window as any).customCards = (window as any).customCards || [];
  (window as any).customCards.push({
    type: "room-scenes-card",
    name: "Room Scenes",
    description: "Hue-style room card with brightness and scene tiles",
    preview: true,
  });
}
