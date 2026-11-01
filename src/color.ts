import type { HassEntity, LightTarget, PaletteEntry } from "./api";

export type RGB = [number, number, number];

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const gammaOut = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const gammaIn = (c: number) => (c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92);

/** CIE xy (+brightness ignored, full-bright) to sRGB 0..255. */
export function xyToRgb(x: number, y: number): RGB {
  if (y <= 0) return [255, 255, 255];
  const Y = 1;
  const X = (Y / y) * x;
  const Z = (Y / y) * (1 - x - y);
  let r = X * 1.656492 - Y * 0.354851 - Z * 0.255038;
  let g = -X * 0.707196 + Y * 1.655397 + Z * 0.036152;
  let b = X * 0.051713 - Y * 0.121364 + Z * 1.01153;
  const max = Math.max(r, g, b);
  if (max > 1) {
    r /= max;
    g /= max;
    b /= max;
  }
  return [r, g, b].map((c) => Math.round(clamp(gammaOut(clamp(c))) * 255)) as RGB;
}

export function rgbToXy(r: number, g: number, b: number): [number, number] {
  const [R, G, B] = [r, g, b].map((c) => gammaIn(c / 255));
  const X = R * 0.664511 + G * 0.154324 + B * 0.162028;
  const Y = R * 0.283881 + G * 0.668433 + B * 0.047685;
  const Z = R * 0.000088 + G * 0.07231 + B * 0.986039;
  const sum = X + Y + Z;
  if (sum === 0) return [0.3127, 0.329];
  return [Math.round((X / sum) * 10000) / 10000, Math.round((Y / sum) * 10000) / 10000];
}

/** Tanner Helland's approximation, good enough for UI swatches. */
export function kelvinToRgb(kelvin: number): RGB {
  const t = kelvin / 100;
  let r: number, g: number, b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  return [r, g, b].map((c) => Math.round(clamp(c, 0, 255))) as RGB;
}

export function hsvToRgb(h: number, s: number, v = 1): RGB {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5), f(3), f(1)].map((c) => Math.round(c * 255)) as RGB;
}

export function rgbToHs(r: number, g: number, b: number): [number, number] {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0];
}

export const css = (rgb: RGB, a = 1) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;

const WARM: RGB = [255, 197, 120];

export function entityRgb(e?: HassEntity): RGB | null {
  if (!e || e.state !== "on") return null;
  const a = e.attributes;
  if (Array.isArray(a.rgb_color)) return a.rgb_color as RGB;
  if (Array.isArray(a.xy_color)) return xyToRgb(a.xy_color[0], a.xy_color[1]);
  if (a.color_temp_kelvin) return kelvinToRgb(a.color_temp_kelvin);
  return WARM;
}

export function targetRgb(t?: LightTarget | PaletteEntry | null): RGB {
  if (!t) return WARM;
  if ((t as any).xy) return xyToRgb((t as any).xy[0], (t as any).xy[1]);
  const k = (t as any).color_temp_kelvin ?? (t as any).kelvin;
  if (k) return kelvinToRgb(k);
  return WARM;
}

/** Hue-style multi-stop gradient. */
export function gradient(colors: RGB[], angle = 120, fallback = "var(--rs-off-bg)"): string {
  if (!colors.length) return fallback;
  if (colors.length === 1) {
    const c = colors[0];
    return `linear-gradient(${angle}deg, ${css(c)} 0%, ${css(mix(c, [0, 0, 0], 0.35))} 100%)`;
  }
  const stops = colors.map((c, i) => `${css(c)} ${Math.round((i / (colors.length - 1)) * 100)}%`);
  return `linear-gradient(${angle}deg, ${stops.join(", ")})`;
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [0, 1, 2].map((i) => Math.round(a[i] * (1 - t) + b[i] * t)) as RGB;
}

/** Perceived lightness, to pick black or white text on top of a colour. */
export function isLight(rgb: RGB): boolean {
  return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2] > 170;
}

export function uniqueColors(colors: RGB[], max = 5): RGB[] {
  const out: RGB[] = [];
  for (const c of colors) {
    if (!out.some((o) => Math.abs(o[0] - c[0]) + Math.abs(o[1] - c[1]) + Math.abs(o[2] - c[2]) < 30)) out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

/** Text sits on the left part of the gradient, so judge contrast there. */
export function needsDarkText(colors: RGB[]): boolean {
  if (!colors.length) return false;
  const left = colors.slice(0, Math.min(2, colors.length));
  const avg = [0, 1, 2].map((i) => left.reduce((s, c) => s + c[i], 0) / left.length) as RGB;
  return isLight(avg);
}
