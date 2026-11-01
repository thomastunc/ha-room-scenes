import { useEffect, useMemo, useState } from "preact/hooks";
import type { Hass, LightTarget, LightTargets, Preset, PresetData, Room, RoomScenesData } from "../api";
import { hub, loadPresets, ws } from "../api";
import { gradient, needsDarkText, uniqueColors } from "../color";
import {
  ColorPicker,
  LightRow,
  PresetTile,
  RoomCard,
  SceneTile,
  Sheet,
  Slider,
  Toggle,
  capsOf,
  friendlyName,
  roomState,
  useThrottled,
} from "../components";
import { strings } from "../i18n";
import { SceneEditor } from "./SceneEditor";

export interface AppProps {
  hass: Hass;
  narrow: boolean;
  path: string; // "" or "/<area_id>"
  navigate: (path: string) => void;
  toggleMenu: () => void;
}

type EditorState =
  | null
  | { sceneId?: string; initial?: { name?: string; preset_id?: string | null; lights: LightTargets } };

export function App(props: AppProps) {
  const { hass } = props;
  const t = strings(hass);
  const [data, setData] = useState<RoomScenesData | null>(hub.data);
  const [presets, setPresets] = useState<PresetData | null>(null);

  useEffect(() => hub.subscribe(hass, setData), []);
  useEffect(() => {
    loadPresets().then(setPresets);
  }, []);

  const dark = hass.themes?.darkMode ?? true;
  const areaId = props.path.replace(/^\//, "").split("/")[0];
  const room = data?.rooms.find((r) => r.area_id === areaId);

  return (
    <div class={`rs-root ${dark ? "" : "light"}`}>
      {!data ? (
        <div class="rs-content">
          <div class="rs-empty">{t.loading}</div>
        </div>
      ) : room ? (
        <RoomPage {...props} data={data} room={room} presets={presets} />
      ) : (
        <HomePage {...props} data={data} />
      )}
    </div>
  );
}

function MenuButton(props: AppProps) {
  if (!props.narrow) return null;
  return (
    <button class="rs-iconbtn" onClick={props.toggleMenu} aria-label="menu">
      <ha-icon icon="mdi:menu" />
    </button>
  );
}

/* ================================================================== home */

function HomePage(props: AppProps & { data: RoomScenesData }) {
  const { hass, data } = props;
  const t = strings(hass);
  const sceneById = useMemo(() => Object.fromEntries(data.scenes.map((s) => [s.id, s])), [data.scenes]);
  const anyOn = data.rooms.some((r) => roomState(hass, r).onCount > 0);
  return (
    <>
      <div class="rs-topbar">
        <MenuButton {...props} />
        <h1>{t.home}</h1>
        {anyOn && (
          <button
            class="rs-iconbtn"
            title={t.allOff}
            onClick={() => hass.callService("light", "turn_off", { entity_id: data.rooms.flatMap((r) => r.lights) })}
          >
            <ha-icon icon="mdi:power" />
          </button>
        )}
      </div>
      <div class="rs-content">
        <div class="rs-section-title">{t.rooms}</div>
        {data.rooms.length === 0 && <div class="rs-empty">{t.noRooms}</div>}
        <div class="rs-room-grid">
          {data.rooms.map((room) => (
            <RoomCard
              hass={hass}
              room={room}
              t={t}
              activeScene={sceneById[data.active[room.area_id]]}
              onOpen={() => props.navigate(`/${room.area_id}`)}
            />
          ))}
        </div>
      </div>
    </>
  );
}

/* ================================================================== room */

function RoomPage(props: AppProps & { data: RoomScenesData; room: Room; presets: PresetData | null }) {
  const { hass, data, room, presets } = props;
  const t = strings(hass);
  const isAdmin = hass.user?.is_admin ?? false;
  const [editor, setEditor] = useState<EditorState>(null);
  const [settings, setSettings] = useState(false);
  const [colorFor, setColorFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [applied, setApplied] = useState<{ preset: Preset; lights: LightTargets } | null>(null);

  const st = roomState(hass, room);
  const on = st.onCount > 0;
  const colors = uniqueColors(st.colors, 4);
  const darkText = on && needsDarkText(colors);
  const scenes = room.scene_order.map((id) => data.scenes.find((s) => s.id === id)!).filter(Boolean);
  const activeId = data.active[room.area_id];
  const activeScene = scenes.find((s) => s.id === activeId);
  const presetById = useMemo(
    () => Object.fromEntries((presets?.presets || []).map((p) => [p.id, p])),
    [presets]
  );
  const setBri = useThrottled<number>((v) => ws.roomBrightness(hass, room.area_id, v));

  useEffect(() => {
    if (!applied) return;
    const timer = window.setTimeout(() => setApplied(null), 12000);
    return () => clearTimeout(timer);
  }, [applied]);

  const activate = async (id: string) => {
    setBusy(id);
    try {
      await ws.activate(hass, id);
    } finally {
      setBusy(null);
    }
  };

  const applyPreset = async (preset: Preset) => {
    setBusy(preset.id);
    try {
      const res = await ws.applyPreset(hass, room.area_id, preset.id);
      setApplied({ preset, lights: res.lights });
    } finally {
      setBusy(null);
    }
  };

  const editingScene = editor?.sceneId ? data.scenes.find((s) => s.id === editor.sceneId) : undefined;

  return (
    <>
      <div
        class={`rs-hero rs-hero-top ${on ? "on" : ""} ${darkText ? "dark-text" : ""}`}
        style={on ? { background: gradient(colors, 110) } : undefined}
      >
        <div class="row">
          <button class="rs-iconbtn" onClick={() => props.navigate("")} aria-label="back">
            <ha-icon icon="mdi:arrow-left" />
          </button>
          <span style={{ flex: 1 }} />
          {isAdmin && (
            <button class="rs-iconbtn" onClick={() => setSettings(true)} aria-label={t.roomSettings}>
              <ha-icon icon="mdi:cog-outline" />
            </button>
          )}
        </div>
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "0 4px" }}>
          <div class="row">
            <h2>{room.name}</h2>
            <Toggle
              on={on}
              onChange={(v) => hass.callService("light", v ? "turn_on" : "turn_off", { entity_id: room.lights })}
            />
          </div>
          <div class="sub">{on ? activeScene?.name || t.lightsOn(st.onCount) : t.off}</div>
          <Slider value={on ? st.brightnessPct : 0} onChange={(v, final) => setBri(v, final)} />
        </div>
      </div>

      <div class="rs-content">
        <div class="rs-section">
          <div class="rs-section-title">{t.myScenes}</div>
          {scenes.length === 0 && <div class="rs-empty" style={{ paddingTop: 0 }}>{t.noScenes}</div>}
          <div class="rs-scene-grid">
            {scenes.map((s) => (
              <SceneTile
                scene={s}
                preset={s.preset_id ? presetById[s.preset_id] : undefined}
                active={s.id === activeId && on}
                busy={busy === s.id}
                zigbee={!!s.z2m_scene_id && s.z2m_sync}
                onClick={() => activate(s.id)}
                onMore={isAdmin ? () => setEditor({ sceneId: s.id }) : undefined}
              />
            ))}
            {isAdmin && (
              <button class="rs-scene add" onClick={() => setEditor({})}>
                <span class="inner">
                  <ha-icon icon="mdi:plus" />
                  {t.newScene}
                </span>
              </button>
            )}
          </div>
        </div>

        <div class="rs-section">
          <div class="rs-section-title">{t.lights}</div>
          <div class="rs-lights">
            {room.lights.map((id) => (
              <LightRow hass={hass} entityId={id} roomName={room.name} onColor={() => setColorFor(id)} />
            ))}
          </div>
        </div>

        {presets && (
          <div class="rs-section">
            <div class="rs-section-title">{t.gallery}</div>
            {presets.categories.map((cat) => {
              const items = presets.presets.filter((p) => p.categoryId === cat.id);
              if (!items.length) return null;
              return (
                <div class="rs-cat">
                  <div class="rs-cat-name">{cat.name}</div>
                  <div class="rs-gallery-row">
                    {items.map((p) => (
                      <PresetTile preset={p} busy={busy === p.id} onClick={() => applyPreset(p)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {applied && (
        <div class="rs-snackbar">
          <span class="msg">
            {applied.preset.name} · {t.applied}
          </span>
          {isAdmin && (
            <button
              class="rs-btn primary"
              onClick={() => {
                setEditor({
                  initial: { name: applied.preset.name, preset_id: applied.preset.id, lights: applied.lights },
                });
                setApplied(null);
              }}
            >
              {t.saveAsScene}
            </button>
          )}
          <button class="rs-iconbtn" onClick={() => setApplied(null)} aria-label="close">
            <ha-icon icon="mdi:close" />
          </button>
        </div>
      )}

      {editor && (
        <SceneEditor
          hass={hass}
          room={room}
          data={data}
          t={t}
          scene={editingScene}
          initial={editor.initial}
          onClose={() => setEditor(null)}
        />
      )}
      {settings && <RoomSettings hass={hass} room={room} data={data} onClose={() => setSettings(false)} />}
      {colorFor && <LightColorSheet hass={hass} entityId={colorFor} room={room} onClose={() => setColorFor(null)} />}
    </>
  );
}

/* ================================================================== light colour */

function LightColorSheet(props: { hass: Hass; entityId: string; room: Room; onClose: () => void }) {
  const { hass, entityId } = props;
  const t = strings(hass);
  const e = hass.states[entityId];
  const a = e?.attributes || {};
  const current: LightTarget = {
    state: e?.state === "on" ? "on" : "off",
    brightness: a.brightness ?? 255,
    xy: a.color_mode && a.color_mode !== "color_temp" ? a.xy_color : null,
    color_temp_kelvin: a.color_temp_kelvin ?? null,
  };
  const send = useThrottled<LightTarget>((target) => {
    const data: Record<string, any> = { entity_id: entityId };
    if (target.xy) data.xy_color = target.xy;
    else if (target.color_temp_kelvin) data.color_temp_kelvin = target.color_temp_kelvin;
    hass.callService("light", "turn_on", data);
  }, 200);
  return (
    <Sheet title={friendlyName(hass, entityId, props.room.name)} onClose={props.onClose}>
      <ColorPicker target={current} caps={capsOf(hass, entityId)} t={t} onChange={(target, final) => send(target, final)} />
      <div style={{ height: "12px" }} />
    </Sheet>
  );
}

/* ================================================================== room settings */

function RoomSettings(props: { hass: Hass; room: Room; data: RoomScenesData; onClose: () => void }) {
  const { hass, room, data } = props;
  const t = strings(hass);
  const scenes = room.scene_order.map((id) => data.scenes.find((s) => s.id === id)!).filter(Boolean);

  const move = (idx: number, dir: -1 | 1) => {
    const order = [...room.scene_order];
    const j = idx + dir;
    if (j < 0 || j >= order.length) return;
    [order[idx], order[j]] = [order[j], order[idx]];
    ws.roomSettings(hass, room.area_id, { scene_order: order });
  };

  return (
    <Sheet title={`${t.roomSettings} · ${room.name}`} onClose={props.onClose}>
      {data.z2m.enabled && (
        <div class="rs-field">
          <div class="rs-label">{t.zigbeeGroup}</div>
          <select
            class="rs-select"
            value={room.z2m_group || ""}
            onChange={(ev) =>
              ws.roomSettings(hass, room.area_id, { z2m_group: (ev.target as HTMLSelectElement).value || null })
            }
          >
            <option value="">{t.none}</option>
            {data.z2m.groups.map((g) => (
              <option value={g}>
                {g}
                {g === room.z2m_suggestion ? ` (${t.suggested})` : ""}
              </option>
            ))}
            {room.z2m_group && !data.z2m.groups.includes(room.z2m_group) && (
              <option value={room.z2m_group}>{room.z2m_group}</option>
            )}
          </select>
          <div class="rs-hint">
            {t.zigbeeGroupHint}
            {room.z2m_group && room.z2m_covered && (
              <>
                <br />
                {room.z2m_covered.length}/{room.lights.length} {t.lights.toLowerCase()}:{" "}
                {room.z2m_covered.map((id) => friendlyName(hass, id, room.name)).join(", ") || "–"}
              </>
            )}
          </div>
        </div>
      )}
      {scenes.length > 1 && (
        <div class="rs-field">
          <div class="rs-label">{t.sceneOrder}</div>
          <div class="rs-order">
            {scenes.map((s, i) => (
              <div class="rs-row">
                <div class="grow t">{s.name}</div>
                <button class="rs-iconbtn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="up">
                  <ha-icon icon="mdi:chevron-up" />
                </button>
                <button class="rs-iconbtn" disabled={i === scenes.length - 1} onClick={() => move(i, 1)} aria-label="down">
                  <ha-icon icon="mdi:chevron-down" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}
