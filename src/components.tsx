import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import type { Hass, LightTarget, Preset, Room, RoomScene } from "./api";
import { presetImage } from "./api";
import {
  RGB,
  css,
  entityRgb,
  gradient,
  hsvToRgb,
  kelvinToRgb,
  needsDarkText,
  rgbToHs,
  rgbToXy,
  targetRgb,
  uniqueColors,
  xyToRgb,
} from "./color";
import type { Strings } from "./i18n";

/* ------------------------------------------------------------------ helpers */

export interface RoomState {
  onCount: number;
  colors: RGB[];
  brightnessPct: number;
}

export function roomState(hass: Hass, room: Room): RoomState {
  const colors: RGB[] = [];
  let bri = 0;
  let onCount = 0;
  for (const id of room.lights) {
    const e = hass.states[id];
    const rgb = entityRgb(e);
    if (rgb && e) {
      onCount++;
      colors.push(rgb);
      bri += e.attributes.brightness ?? 255;
    }
  }
  return { onCount, colors, brightnessPct: onCount ? Math.max(1, Math.round(bri / onCount / 2.55)) : 0 };
}

export function friendlyName(hass: Hass, entityId: string, roomName?: string): string {
  const name: string = hass.states[entityId]?.attributes.friendly_name || entityId;
  if (roomName && name.toLowerCase().startsWith(roomName.toLowerCase() + " ")) {
    return name.slice(roomName.length + 1);
  }
  return name;
}

/** Throttle continuous slider updates; always deliver the final value. */
export function useThrottled<T>(fn: (v: T) => void, ms = 180) {
  const last = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<T | undefined>(undefined);
  return (v: T, final = false) => {
    pending.current = v;
    const now = Date.now();
    clearTimeout(timer.current);
    if (final || now - last.current >= ms) {
      last.current = now;
      fn(v);
    } else {
      timer.current = window.setTimeout(() => {
        last.current = Date.now();
        fn(pending.current as T);
      }, ms - (now - last.current));
    }
  };
}

/* ------------------------------------------------------------------ toggle */

export function Toggle(props: { on: boolean; onChange: (on: boolean) => void; neutral?: boolean; label?: string }) {
  return (
    <button
      class={`rs-toggle ${props.on ? "on" : ""} ${props.neutral ? "neutral" : ""}`}
      role="switch"
      aria-checked={props.on}
      aria-label={props.label}
      onClick={(ev) => {
        ev.stopPropagation();
        props.onChange(!props.on);
      }}
    />
  );
}

/* ------------------------------------------------------------------ slider */

export function Slider(props: {
  value: number; // 0..100
  onChange: (v: number, final: boolean) => void;
  disabled?: boolean;
  neutral?: boolean;
  icon?: boolean;
  min?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const min = props.min ?? 1;
  const shown = drag ?? props.value;

  const valueAt = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.round(Math.min(100, Math.max(min, ((clientX - r.left) / r.width) * 100)));
  };

  const down = (ev: PointerEvent) => {
    ev.stopPropagation();
    if (props.disabled && !props.onChange) return;
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    const v = valueAt(ev.clientX);
    setDrag(v);
    props.onChange(v, false);
  };
  const move = (ev: PointerEvent) => {
    if (drag === null) return;
    const v = valueAt(ev.clientX);
    setDrag(v);
    props.onChange(v, false);
  };
  const up = (ev: PointerEvent) => {
    if (drag === null) return;
    const v = valueAt(ev.clientX);
    setDrag(null);
    props.onChange(v, true);
  };

  return (
    <div
      ref={ref}
      class={`rs-slider ${drag !== null ? "dragging" : ""} ${props.disabled ? "disabled" : ""} ${props.neutral ? "neutral" : ""}`}
      role="slider"
      aria-valuenow={shown}
      aria-valuemin={min}
      aria-valuemax={100}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onClick={(ev) => ev.stopPropagation()}
    >
      <div class="fill" style={{ width: `${shown}%` }} />
      {shown > 4 && <div class="knob" style={{ left: `${shown}%` }} />}
      {props.icon !== false && (
        <div class="icon">
          <ha-icon icon="mdi:brightness-6" />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ room card */

export function RoomCard(props: {
  hass: Hass;
  room: Room;
  activeScene?: RoomScene;
  t: Strings;
  onOpen?: () => void;
}) {
  const { hass, room, t } = props;
  const st = roomState(hass, room);
  const on = st.onCount > 0;
  const colors = uniqueColors(st.colors, 4);
  const darkText = on && needsDarkText(colors);
  const setBri = useThrottled<number>((v) => {
    hass.callWS({ type: "room_scenes/room_brightness", area_id: room.area_id, brightness_pct: v });
  });

  const subtitle = on ? props.activeScene?.name || t.lightsOn(st.onCount) : t.off;

  return (
    <div
      class={`rs-room ${on ? "on" : ""} ${darkText ? "dark-text" : ""}`}
      style={on ? { background: gradient(colors, 110) } : undefined}
      onClick={props.onOpen}
    >
      <div class="head">
        <div class="room-icon">
          <ha-icon icon={room.icon || "mdi:sofa-outline"} />
        </div>
        <div class="titles">
          <div class="title">{room.name}</div>
          <div class="subtitle">{subtitle}</div>
        </div>
        <Toggle
          on={on}
          label={room.name}
          onChange={(v) => hass.callService("light", v ? "turn_on" : "turn_off", { entity_id: room.lights })}
        />
      </div>
      <Slider value={on ? st.brightnessPct : 0} onChange={(v, final) => setBri(v, final)} />
    </div>
  );
}

/* ------------------------------------------------------------------ scene tile */

export function sceneColors(scene: RoomScene): RGB[] {
  return uniqueColors(scene.palette.map((p) => targetRgb(p)), 5);
}

export function SceneTile(props: {
  scene: RoomScene;
  preset?: Preset;
  active?: boolean;
  busy?: boolean;
  zigbee?: boolean;
  onClick: () => void;
  onMore?: () => void;
}) {
  const { scene, preset } = props;
  const colors = sceneColors(scene);
  const img = preset ? presetImage(preset) : null;
  return (
    <button
      class={`rs-scene ${props.active ? "active" : ""} ${props.busy ? "busy" : ""}`}
      onClick={props.onClick}
      title={scene.name}
    >
      <div
        class="bg"
        style={img ? { backgroundImage: `url(${img})` } : { background: gradient(colors.length ? colors : [[255, 197, 120]], 135) }}
      />
      <div class="shade" />
      {img && (
        <div class="dots">
          {colors.slice(0, 4).map((c) => (
            <span class="dot" style={{ background: css(c) }} />
          ))}
        </div>
      )}
      <div class="badge">
        {scene.dynamic && <ha-icon icon="mdi:creation" />}
        {props.zigbee && <ha-icon icon="mdi:zigbee" />}
      </div>
      <div class="label">{scene.name}</div>
      {props.onMore && (
        <span
          class="more"
          role="button"
          onClick={(ev) => {
            ev.stopPropagation();
            props.onMore!();
          }}
        >
          <ha-icon icon="mdi:dots-horizontal" />
        </span>
      )}
    </button>
  );
}

export function PresetTile(props: { preset: Preset; onClick: () => void; busy?: boolean }) {
  const img = presetImage(props.preset);
  const colors = props.preset.lights.map((l) => xyToRgb(l.x, l.y));
  return (
    <button class={`rs-scene ${props.busy ? "busy" : ""}`} onClick={props.onClick} title={props.preset.name}>
      <div class="bg" style={img ? { backgroundImage: `url(${img})` } : { background: gradient(colors, 135) }} />
      <div class="shade" />
      <div class="label">{props.preset.name}</div>
    </button>
  );
}

/* ------------------------------------------------------------------ light row */

export function LightRow(props: { hass: Hass; entityId: string; roomName: string; onColor?: () => void }) {
  const { hass, entityId } = props;
  const e = hass.states[entityId];
  const on = e?.state === "on";
  const rgb = entityRgb(e);
  const modes: string[] = e?.attributes.supported_color_modes || [];
  const dimmable = modes.some((m) => m !== "onoff");
  const setBri = useThrottled<number>((v) => {
    hass.callService("light", "turn_on", { entity_id: entityId, brightness_pct: v });
  });
  return (
    <div class="rs-light">
      <button
        class={`bulb ${on ? "on" : ""}`}
        style={rgb ? { background: css(rgb) } : undefined}
        onClick={props.onColor}
        aria-label="colour"
      >
        <ha-icon icon={on ? "mdi:lightbulb" : "mdi:lightbulb-outline"} />
      </button>
      <div class="mid">
        <div class="name">{friendlyName(hass, entityId, props.roomName)}</div>
        {dimmable && (
          <Slider
            neutral
            value={on ? Math.round(((e?.attributes.brightness ?? 255) / 255) * 100) : 0}
            onChange={(v, final) => setBri(v, final)}
          />
        )}
      </div>
      <Toggle neutral on={on} onChange={(v) => hass.callService("light", v ? "turn_on" : "turn_off", { entity_id: entityId })} />
    </div>
  );
}

/* ------------------------------------------------------------------ colour picker */

export interface PickerCaps {
  color: boolean;
  colorTemp: boolean;
  minK: number;
  maxK: number;
}

export function capsOf(hass: Hass, entityId: string): PickerCaps {
  const a = hass.states[entityId]?.attributes || {};
  const modes: string[] = a.supported_color_modes || [];
  return {
    color: modes.some((m) => ["xy", "hs", "rgb", "rgbw", "rgbww"].includes(m)),
    colorTemp: modes.includes("color_temp"),
    minK: a.min_color_temp_kelvin || 2000,
    maxK: a.max_color_temp_kelvin || 6500,
  };
}

function drawWheel(canvas: HTMLCanvasElement) {
  const size = canvas.width;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const r = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - r;
      const dy = y - r;
      const d = Math.sqrt(dx * dx + dy * dy);
      const i = (y * size + x) * 4;
      if (d > r) {
        img.data[i + 3] = 0;
        continue;
      }
      const h = (Math.atan2(dy, dx) * 180) / Math.PI + 180;
      const [R, G, B] = hsvToRgb(h, Math.min(1, d / r), 1);
      img.data[i] = R;
      img.data[i + 1] = G;
      img.data[i + 2] = B;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function ColorPicker(props: {
  target: LightTarget;
  caps: PickerCaps;
  t: Strings;
  onChange: (t: LightTarget, final: boolean) => void;
}) {
  const { target, caps, t } = props;
  const initialMode = target.xy && caps.color ? "color" : caps.colorTemp ? "white" : "color";
  const [mode, setMode] = useState<"color" | "white">(initialMode);
  const canvas = useRef<HTMLCanvasElement>(null);
  const wheel = useRef<HTMLDivElement>(null);
  const ct = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    if (mode === "color" && canvas.current) drawWheel(canvas.current);
  }, [mode]);

  const rgb = targetRgb(target);
  const [h, s] = rgbToHs(...rgb);
  const markerX = 50 + Math.cos(((h - 180) * Math.PI) / 180) * s * 50;
  const markerY = 50 + Math.sin(((h - 180) * Math.PI) / 180) * s * 50;

  const pickWheel = (ev: PointerEvent, final: boolean) => {
    const r = wheel.current!.getBoundingClientRect();
    const dx = ev.clientX - (r.left + r.width / 2);
    const dy = ev.clientY - (r.top + r.height / 2);
    const sat = Math.min(1, Math.sqrt(dx * dx + dy * dy) / (r.width / 2));
    const hue = (Math.atan2(dy, dx) * 180) / Math.PI + 180;
    const [R, G, B] = hsvToRgb(hue, sat, 1);
    const xy = rgbToXy(R, G, B);
    props.onChange({ ...target, state: "on", xy, color_temp_kelvin: null }, final);
  };

  const kelvin = target.color_temp_kelvin ?? 2700;
  const ctPos = ((kelvin - caps.minK) / (caps.maxK - caps.minK)) * 100;
  const pickCt = (ev: PointerEvent, final: boolean) => {
    const r = ct.current!.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
    const k = Math.round((caps.minK + p * (caps.maxK - caps.minK)) / 50) * 50;
    props.onChange({ ...target, state: "on", xy: null, color_temp_kelvin: k }, final);
  };

  const handlers = (fn: (ev: PointerEvent, final: boolean) => void) => ({
    onPointerDown: (ev: PointerEvent) => {
      dragging.current = true;
      (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
      fn(ev, false);
    },
    onPointerMove: (ev: PointerEvent) => dragging.current && fn(ev, false),
    onPointerUp: (ev: PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      fn(ev, true);
    },
  });

  const ctStops = [0, 0.25, 0.5, 0.75, 1]
    .map((p) => css(kelvinToRgb(caps.minK + p * (caps.maxK - caps.minK))))
    .join(", ");

  return (
    <div class="rs-picker">
      {caps.color && caps.colorTemp && (
        <div class="rs-seg" style={{ width: "100%" }}>
          <button class={mode === "color" ? "sel" : ""} onClick={() => setMode("color")}>
            {t.color}
          </button>
          <button class={mode === "white" ? "sel" : ""} onClick={() => setMode("white")}>
            {t.white}
          </button>
        </div>
      )}
      {mode === "color" && caps.color && (
        <div class="rs-wheel" ref={wheel} {...handlers(pickWheel)}>
          <canvas ref={canvas} width={240} height={240} />
          {target.xy && <div class="marker" style={{ left: `${markerX}%`, top: `${markerY}%`, background: css(rgb) }} />}
        </div>
      )}
      {(mode === "white" || !caps.color) && caps.colorTemp && (
        <div class="rs-ct" ref={ct} style={{ background: `linear-gradient(90deg, ${ctStops})` }} {...handlers(pickCt)}>
          {!target.xy && (
            <div class="marker" style={{ left: `${Math.min(100, Math.max(0, ctPos))}%`, background: css(kelvinToRgb(kelvin)) }} />
          )}
        </div>
      )}
    </div>
  );
}


/* ------------------------------------------------------------------ sheet */

export function Sheet(props: { title: string; onClose: () => void; children: ComponentChildren; actions?: ComponentChildren }) {
  useEffect(() => {
    const key = (ev: KeyboardEvent) => ev.key === "Escape" && props.onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return (
    <div class="rs-sheet-backdrop" onClick={props.onClose}>
      <div class="rs-sheet" onClick={(ev) => ev.stopPropagation()} role="dialog" aria-label={props.title}>
        <div class="grab" />
        <div class="rs-sheet-head">
          <h3>{props.title}</h3>
          {props.actions}
          <button class="rs-iconbtn" onClick={props.onClose} aria-label="close">
            <ha-icon icon="mdi:close" />
          </button>
        </div>
        {props.children}
      </div>
    </div>
  );
}

/* JSX typing for HA's global custom elements */
declare module "preact" {
  namespace JSX {
    interface IntrinsicElements {
      "ha-icon": { icon?: string; style?: any; class?: string };
      "ha-card": any;
    }
  }
}
