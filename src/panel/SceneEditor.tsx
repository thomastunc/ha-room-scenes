import { useMemo, useState } from "preact/hooks";
import type { Hass, LightTarget, LightTargets, Room, RoomScene, RoomScenesData } from "../api";
import { ws } from "../api";
import { css, targetRgb } from "../color";
import { ColorPicker, Sheet, Slider, Toggle, capsOf, friendlyName, useThrottled } from "../components";
import type { Strings } from "../i18n";

export function lightsFromCurrent(hass: Hass, room: Room): LightTargets {
  const out: LightTargets = {};
  for (const id of room.lights) {
    const e = hass.states[id];
    if (!e || e.state !== "on") {
      out[id] = { state: "off" };
      continue;
    }
    const a = e.attributes;
    const t: LightTarget = { state: "on", brightness: a.brightness ?? 255 };
    if (a.color_mode && a.color_mode !== "color_temp" && Array.isArray(a.xy_color)) t.xy = [a.xy_color[0], a.xy_color[1]];
    else if (a.color_temp_kelvin) t.color_temp_kelvin = a.color_temp_kelvin;
    out[id] = t;
  }
  return out;
}

const SPEEDS = [
  { key: "slow", interval: 60 },
  { key: "medium", interval: 30 },
  { key: "fast", interval: 10 },
] as const;

export function SceneEditor(props: {
  hass: Hass;
  room: Room;
  data: RoomScenesData;
  t: Strings;
  scene?: RoomScene;
  initial?: { name?: string; preset_id?: string | null; lights: LightTargets };
  onClose: () => void;
}) {
  const { hass, room, t, scene, data } = props;
  const [name, setName] = useState(scene?.name ?? props.initial?.name ?? "");
  const [lights, setLights] = useState<LightTargets>(() => {
    const base = scene?.lights ?? props.initial?.lights ?? lightsFromCurrent(hass, room);
    // make sure every current room light is represented
    const merged: LightTargets = {};
    for (const id of room.lights) merged[id] = base[id] ?? { state: "off" };
    return merged;
  });
  const presetId = scene?.preset_id ?? props.initial?.preset_id ?? null;
  const [dynamic, setDynamic] = useState(scene?.dynamic ?? false);
  const [interval, setIntervalSec] = useState(scene?.interval ?? 30);
  const [z2mSync, setZ2mSync] = useState(scene?.z2m_sync ?? true);
  const [selected, setSelected] = useState<string>(room.lights[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useThrottled<LightTargets>((l) => {
    ws.preview(hass, l).catch(() => undefined);
  }, 200);

  const update = (id: string, target: LightTarget, final = true) => {
    const next = { ...lights, [id]: target };
    setLights(next);
    preview({ [id]: target }, final);
  };

  const onLights = Object.values(lights).filter((l) => l.state === "on");
  const avgBri = onLights.length
    ? Math.round(onLights.reduce((s, l) => s + (l.brightness ?? 255), 0) / onLights.length / 2.55)
    : 0;

  const setAllBrightness = (pct: number, final: boolean) => {
    if (!onLights.length) return;
    const factor = (pct * 2.55) / ((avgBri || 1) * 2.55);
    const next: LightTargets = {};
    for (const [id, l] of Object.entries(lights)) {
      next[id] =
        l.state === "on"
          ? { ...l, brightness: Math.max(1, Math.min(255, Math.round((l.brightness ?? 255) * factor))) }
          : l;
    }
    setLights(next);
    const changed: LightTargets = {};
    for (const [id, l] of Object.entries(next)) if (l.state === "on") changed[id] = l;
    preview(changed, final);
  };

  const sel = lights[selected];
  const caps = useMemo(() => capsOf(hass, selected), [selected]);
  const hasZ2M = data.z2m.enabled && !!room.z2m_group;
  const status = scene ? data.z2m.status[scene.id] : undefined;

  const save = async () => {
    if (!name.trim()) {
      setError(t.name);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await ws.save(hass, {
        ...(scene ? { id: scene.id } : {}),
        area_id: room.area_id,
        name: name.trim(),
        preset_id: presetId,
        lights,
        dynamic: dynamic && !!presetId,
        interval,
        z2m_sync: z2mSync,
      });
      props.onClose();
    } catch (err: any) {
      setError(err?.message || String(err));
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!scene || !confirm(t.deleteConfirm)) return;
    await ws.remove(hass, scene.id);
    props.onClose();
  };

  return (
    <Sheet title={scene ? t.editScene : t.newScene} onClose={props.onClose}>
      <div class="rs-field">
        <input
          class="rs-input"
          placeholder={t.name}
          value={name}
          maxLength={64}
          onInput={(ev) => setName((ev.target as HTMLInputElement).value)}
        />
      </div>

      <div class="rs-label">{t.tapToEdit}</div>
      <div class="rs-palette">
        {room.lights.map((id) => {
          const l = lights[id];
          const on = l?.state === "on";
          return (
            <button class={`rs-pal-item ${selected === id ? "sel" : ""}`} onClick={() => setSelected(id)}>
              <span class={`sw ${on ? "" : "off"}`} style={on ? { background: css(targetRgb(l)) } : undefined}>
                {!on && <ha-icon icon="mdi:power" />}
              </span>
              <span class="n">{friendlyName(hass, id, room.name)}</span>
            </button>
          );
        })}
      </div>

      {sel && (
        <div class="rs-field">
          <div class="rs-row" style={{ marginBottom: "12px" }}>
            <div class="grow">
              <div class="t">{friendlyName(hass, selected, room.name)}</div>
            </div>
            <Toggle
              neutral
              on={sel.state === "on"}
              onChange={(v) =>
                update(selected, v ? { brightness: 200, ...sel, state: "on" } : { ...sel, state: "off" })
              }
            />
          </div>
          {sel.state === "on" && (
            <>
              <ColorPicker
                key={selected}
                target={sel}
                caps={caps}
                t={t}
                onChange={(target, final) => update(selected, target, final)}
              />
              <div class="rs-label" style={{ marginTop: "14px" }}>
                {t.brightness}
              </div>
              <Slider
                neutral
                value={Math.round(((sel.brightness ?? 255) / 255) * 100)}
                onChange={(v, final) => update(selected, { ...sel, brightness: Math.round(v * 2.55) }, final)}
              />
            </>
          )}
        </div>
      )}

      <div class="rs-field">
        <div class="rs-label">
          {t.allBrightness}
        </div>
        <Slider neutral value={avgBri} onChange={setAllBrightness} disabled={!onLights.length} />
      </div>

      {presetId && (
        <div class="rs-field">
          <div class="rs-row">
            <ha-icon icon="mdi:creation" />
            <div class="grow">
              <div class="t">{t.dynamic}</div>
              <div class="s">{t.dynamicHint}</div>
            </div>
            <Toggle neutral on={dynamic} onChange={setDynamic} />
          </div>
          {dynamic && (
            <div class="rs-seg" style={{ marginTop: "10px" }}>
              {SPEEDS.map((sp) => (
                <button class={interval === sp.interval ? "sel" : ""} onClick={() => setIntervalSec(sp.interval)}>
                  {t[sp.key]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {hasZ2M && !dynamic && (
        <div class="rs-field">
          <div class="rs-row">
            <ha-icon icon="mdi:zigbee" />
            <div class="grow">
              <div class="t">{t.storeOnLamps}</div>
              <div class="s">
                {status === "storing"
                  ? t.storing
                  : status === "stored" || scene?.z2m_scene_id
                    ? `${t.stored} · ${room.z2m_group}`
                    : status === "failed"
                      ? t.storeFailed
                      : room.z2m_group}
              </div>
            </div>
            <Toggle neutral on={z2mSync} onChange={setZ2mSync} />
          </div>
        </div>
      )}

      {error && <div class="rs-hint" style={{ color: "#ff453a" }}>{error}</div>}

      <div class="rs-actions">
        {scene && (
          <button class="rs-btn danger" onClick={remove}>
            {t.delete}
          </button>
        )}
        <span class="spacer" />
        <button class="rs-btn" onClick={props.onClose}>
          {t.cancel}
        </button>
        <button class="rs-btn primary" onClick={save} disabled={saving}>
          {t.save}
        </button>
      </div>
    </Sheet>
  );
}
