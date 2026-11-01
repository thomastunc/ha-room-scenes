export const baseStyles = `
:host {
  --rs-radius: 18px;
  --rs-gap: 12px;
  --rs-font: var(--ha-font-family-body, Roboto, "Helvetica Neue", system-ui, sans-serif);
  display: block;
  font-family: var(--rs-font);
  -webkit-font-smoothing: antialiased;
}
.rs-root {
  --rs-bg: #121212;
  --rs-surface: #1f1f22;
  --rs-surface-2: #2a2a2e;
  --rs-text: #f4f4f5;
  --rs-text-2: #a1a1aa;
  --rs-off-bg: #2a2a2e;
  --rs-accent: #fff;
  --rs-border: rgba(255,255,255,0.08);
  color: var(--rs-text);
}
.rs-root.light {
  --rs-bg: #f2f2f5;
  --rs-surface: #ffffff;
  --rs-surface-2: #ececf0;
  --rs-text: #18181b;
  --rs-text-2: #6b6b76;
  --rs-off-bg: #e4e4e9;
  --rs-accent: #18181b;
  --rs-border: rgba(0,0,0,0.08);
}
* { box-sizing: border-box; }
button { font: inherit; color: inherit; }
ha-icon { --mdc-icon-size: 22px; display: inline-flex; }

/* ---------- toggle ---------- */
.rs-toggle {
  position: relative; width: 50px; height: 30px; border-radius: 15px; flex: none;
  background: rgba(0,0,0,0.25); border: none; cursor: pointer; padding: 0;
  transition: background .2s;
}
.rs-toggle::after {
  content: ""; position: absolute; top: 3px; left: 3px; width: 24px; height: 24px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.35); transition: transform .2s;
}
.rs-toggle.on { background: rgba(255,255,255,0.45); }
.rs-toggle.on::after { transform: translateX(20px); }
.rs-toggle.neutral { background: var(--rs-surface-2); }
.rs-toggle.neutral.on { background: #34c759; }

/* ---------- brightness slider ---------- */
.rs-slider {
  position: relative; height: 40px; border-radius: 20px; overflow: hidden; cursor: pointer;
  background: rgba(0,0,0,0.28); touch-action: none; user-select: none;
}
.rs-slider .fill {
  position: absolute; inset: 0 auto 0 0; background: rgba(255,255,255,0.55);
  border-radius: 20px 0 0 20px; transition: width .08s linear;
}
.rs-slider.dragging .fill { transition: none; }
.rs-slider .knob {
  position: absolute; top: 50%; width: 4px; height: 20px; margin-left: -12px; transform: translateY(-50%);
  border-radius: 2px; background: rgba(0,0,0,0.35);
}
.rs-slider .icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); opacity: .8; pointer-events: none; }
.rs-slider .icon ha-icon { --mdc-icon-size: 18px; }
.rs-slider.disabled { opacity: .45; }
.rs-slider.neutral { background: var(--rs-surface-2); }
.rs-slider.neutral .fill { background: var(--rs-text-2); }

/* ---------- room card ---------- */
.rs-room {
  position: relative; border-radius: var(--rs-radius); padding: 16px 16px 14px; overflow: hidden;
  background: var(--rs-off-bg); color: var(--rs-text); cursor: pointer;
  box-shadow: 0 1px 2px rgba(0,0,0,.15);
  transition: transform .12s ease, background .4s ease;
  display: flex; flex-direction: column; gap: 14px; min-height: 128px;
}
.rs-room:active { transform: scale(.985); }
.rs-room.on.dark-text { color: #111; }
.rs-room.on:not(.dark-text) { color: #fff; }
.rs-room .head { display: flex; align-items: center; gap: 12px; }
.rs-room .room-icon {
  width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; flex: none;
  background: rgba(0,0,0,0.18);
}
.rs-root.light .rs-room:not(.on) .room-icon { background: rgba(0,0,0,0.06); }
.rs-room .titles { flex: 1; min-width: 0; }
.rs-room .title { font-size: 17px; font-weight: 600; letter-spacing: .1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rs-room .subtitle { font-size: 13px; opacity: .78; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rs-room:not(.on) .rs-slider { background: rgba(127,127,127,0.18); }
.rs-room:not(.on) .rs-slider .fill { background: transparent; }

/* ---------- scene tile ---------- */
.rs-scene-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: var(--rs-gap); }
.rs-scene-row { display: flex; gap: 10px; overflow-x: auto; scrollbar-width: none; padding: 2px 2px 4px; }
.rs-scene-row::-webkit-scrollbar { display: none; }
.rs-scene-row .rs-scene { flex: 0 0 132px; height: 96px; }
.rs-scene {
  position: relative; height: 112px; border-radius: 16px; overflow: hidden; cursor: pointer; border: none; padding: 0;
  background: var(--rs-surface-2); text-align: left; color: #fff;
  box-shadow: 0 1px 2px rgba(0,0,0,.2); transition: transform .12s ease;
}
.rs-scene:active { transform: scale(.97); }
.rs-scene .bg { position: absolute; inset: 0; background-size: cover; background-position: center; }
.rs-scene .shade { position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(0,0,0,0) 40%, rgba(0,0,0,.55)); }
.rs-scene .label { position: absolute; left: 12px; right: 36px; bottom: 10px; font-size: 14px; font-weight: 600; line-height: 1.2;
  text-shadow: 0 1px 2px rgba(0,0,0,.4); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.rs-scene .dots { position: absolute; left: 12px; top: 12px; display: flex; }
.rs-scene .dot { width: 22px; height: 22px; border-radius: 50%; border: 2px solid rgba(255,255,255,.85); margin-right: -6px; box-shadow: 0 1px 2px rgba(0,0,0,.3); }
.rs-scene .badge { position: absolute; top: 8px; right: 8px; display: flex; gap: 4px; }
.rs-scene .badge ha-icon { --mdc-icon-size: 16px; color: #fff; filter: drop-shadow(0 1px 1px rgba(0,0,0,.5)); }
.rs-scene .more { position: absolute; right: 4px; bottom: 4px; width: 32px; height: 32px; border-radius: 50%; border: none; background: transparent; color: #fff; cursor: pointer; display: grid; place-items: center; }
.rs-scene .more ha-icon { --mdc-icon-size: 18px; }
.rs-scene.active { box-shadow: 0 0 0 3px var(--rs-accent), 0 4px 14px rgba(0,0,0,.3); }
.rs-scene.add { background: transparent; border: 2px dashed var(--rs-border); color: var(--rs-text-2); display: grid; place-items: center; box-shadow: none; }
.rs-scene.add .inner { display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; }
.rs-scene.add ha-icon { --mdc-icon-size: 28px; }
.rs-scene.busy::after { content: ""; position: absolute; inset: 0; background: rgba(255,255,255,.18); animation: rs-pulse 1s ease-in-out infinite; }
@keyframes rs-pulse { 0%,100% { opacity: 0 } 50% { opacity: 1 } }

/* ---------- light row ---------- */
.rs-lights { display: flex; flex-direction: column; gap: 10px; }
.rs-light { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 16px; background: var(--rs-surface); }
.rs-light .bulb { width: 40px; height: 40px; border-radius: 50%; flex: none; display: grid; place-items: center; cursor: pointer; border: none;
  background: var(--rs-surface-2); color: var(--rs-text-2); box-shadow: inset 0 0 0 1px var(--rs-border); }
.rs-light .bulb.on { color: rgba(0,0,0,.55); }
.rs-light .mid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.rs-light .name { font-size: 15px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rs-light .rs-slider { height: 28px; }
.rs-light .rs-slider .icon { display: none; }
`;

export const panelStyles = `
.rs-root { min-height: 100vh; background: var(--rs-bg); padding-bottom: 80px; }
.rs-topbar { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 8px; padding: 10px 12px;
  background: color-mix(in srgb, var(--rs-bg) 88%, transparent); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }
.rs-topbar h1 { font-size: 22px; font-weight: 700; margin: 0; flex: 1; letter-spacing: .2px; }
.rs-iconbtn { width: 40px; height: 40px; border-radius: 50%; border: none; background: transparent; display: grid; place-items: center; cursor: pointer; color: inherit; flex: none; }
.rs-iconbtn:hover { background: rgba(127,127,127,.15); }
.rs-content { max-width: 1100px; margin: 0 auto; padding: 4px 16px 24px; }
.rs-section { margin-top: 26px; }
.rs-section-title { font-size: 13px; font-weight: 600; letter-spacing: .8px; text-transform: uppercase; color: var(--rs-text-2); margin: 0 4px 12px; display: flex; align-items: center; gap: 8px; }
.rs-room-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--rs-gap); }
.rs-empty { color: var(--rs-text-2); padding: 24px 6px; font-size: 15px; line-height: 1.5; }
.rs-floor { margin-top: 22px; }

/* room hero */
.rs-hero { position: relative; padding: 8px 16px 20px; background: var(--rs-off-bg); transition: background .4s ease; }
.rs-hero.on { color: #fff; }
.rs-hero.on:not(.dark-text) h2, .rs-hero.on:not(.dark-text) .sub, .rs-room.on:not(.dark-text) .titles { text-shadow: 0 1px 6px rgba(0,0,0,.35); }
.rs-hero.on.dark-text { color: #111; }
.rs-hero .row { display: flex; align-items: center; gap: 10px; }
.rs-hero h2 { font-size: 28px; font-weight: 700; margin: 6px 0 2px; flex: 1; }
.rs-hero .sub { font-size: 14px; opacity: .8; margin-bottom: 14px; }
.rs-hero .rs-slider { height: 44px; border-radius: 22px; }
.rs-hero-top { position: sticky; top: 0; z-index: 6; }

/* gallery */
.rs-cat { margin-bottom: 20px; }
.rs-cat-name { font-size: 15px; font-weight: 600; margin: 0 4px 10px; }
.rs-gallery-row { display: flex; gap: 10px; overflow-x: auto; padding: 2px 2px 6px; scroll-snap-type: x proximity; scrollbar-width: thin; }
.rs-gallery-row .rs-scene { flex: 0 0 138px; height: 138px; scroll-snap-align: start; }

/* bottom bar / snackbar */
.rs-snackbar { position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); z-index: 20; display: flex; align-items: center; gap: 12px;
  background: var(--rs-surface); color: var(--rs-text); padding: 10px 10px 10px 18px; border-radius: 28px; box-shadow: 0 8px 30px rgba(0,0,0,.35); max-width: calc(100vw - 32px); }
.rs-snackbar .msg { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* buttons */
.rs-btn { border: none; border-radius: 22px; padding: 10px 18px; font-size: 14px; font-weight: 600; cursor: pointer; background: var(--rs-surface-2); color: var(--rs-text); white-space: nowrap; }
.rs-btn.primary { background: var(--rs-accent); color: var(--rs-bg); }
.rs-btn.danger { background: transparent; color: #ff453a; }
.rs-btn:disabled { opacity: .5; cursor: default; }

/* sheet */
.rs-sheet-backdrop { position: fixed; inset: 0; z-index: 30; background: rgba(0,0,0,.5); display: flex; align-items: flex-end; justify-content: center; animation: rs-fade .2s ease; }
.rs-sheet { width: 100%; max-width: 640px; max-height: 92vh; overflow-y: auto; background: var(--rs-bg); color: var(--rs-text);
  border-radius: 22px 22px 0 0; padding: 8px 18px 24px; animation: rs-up .25s cubic-bezier(.2,.9,.3,1); }
@media (min-width: 700px) { .rs-sheet-backdrop { align-items: center; } .rs-sheet { border-radius: 22px; } }
.rs-sheet .grab { width: 40px; height: 5px; border-radius: 3px; background: var(--rs-border); margin: 4px auto 10px; }
.rs-sheet-head { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.rs-sheet-head h3 { flex: 1; font-size: 19px; margin: 0; font-weight: 700; }
@keyframes rs-fade { from { opacity: 0 } }
@keyframes rs-up { from { transform: translateY(40px); opacity: .4 } }

.rs-field { margin: 16px 0; }
.rs-label { font-size: 13px; color: var(--rs-text-2); margin: 0 2px 8px; font-weight: 500; }
.rs-input, .rs-select { width: 100%; font: inherit; font-size: 16px; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--rs-border); background: var(--rs-surface); color: var(--rs-text); outline: none; }
.rs-input:focus, .rs-select:focus { border-color: var(--rs-text-2); }
.rs-hint { font-size: 12.5px; color: var(--rs-text-2); margin: 8px 2px 0; line-height: 1.45; }
.rs-row { display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: var(--rs-surface); border-radius: 14px; }
.rs-row .grow { flex: 1; min-width: 0; }
.rs-row .t { font-size: 15px; font-weight: 500; }
.rs-row .s { font-size: 12.5px; color: var(--rs-text-2); margin-top: 2px; }
.rs-seg { display: flex; background: var(--rs-surface-2); border-radius: 12px; padding: 3px; gap: 3px; }
.rs-seg button { flex: 1; border: none; background: transparent; padding: 8px 10px; border-radius: 9px; cursor: pointer; font-size: 13px; font-weight: 600; color: var(--rs-text-2); }
.rs-seg button.sel { background: var(--rs-surface); color: var(--rs-text); box-shadow: 0 1px 2px rgba(0,0,0,.2); }
.rs-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 22px; align-items: center; }
.rs-actions .spacer { flex: 1; }

/* scene editor: light palette */
.rs-palette { display: flex; flex-wrap: wrap; gap: 14px; justify-content: center; padding: 18px 8px; border-radius: 20px; background: var(--rs-surface); }
.rs-pal-item { display: flex; flex-direction: column; align-items: center; gap: 6px; width: 72px; cursor: pointer; border: none; background: transparent; padding: 0; }
.rs-pal-item .sw { width: 56px; height: 56px; border-radius: 50%; box-shadow: inset 0 0 0 1px var(--rs-border), 0 2px 8px rgba(0,0,0,.2); display: grid; place-items: center; transition: transform .12s; }
.rs-pal-item.sel .sw { box-shadow: 0 0 0 3px var(--rs-accent), 0 2px 8px rgba(0,0,0,.25); transform: scale(1.05); }
.rs-pal-item .sw.off { background: repeating-linear-gradient(45deg, var(--rs-surface-2), var(--rs-surface-2) 6px, transparent 6px, transparent 12px); color: var(--rs-text-2); }
.rs-pal-item .n { font-size: 11.5px; color: var(--rs-text-2); text-align: center; line-height: 1.2; max-width: 72px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }

/* colour picker */
.rs-picker { display: flex; flex-direction: column; align-items: center; gap: 14px; }
.rs-wheel { position: relative; width: 240px; height: 240px; touch-action: none; cursor: crosshair; }
.rs-wheel canvas { width: 100%; height: 100%; border-radius: 50%; }
.rs-wheel .marker { position: absolute; width: 28px; height: 28px; margin: -14px 0 0 -14px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.5); pointer-events: none; }
.rs-ct { position: relative; width: 100%; height: 44px; border-radius: 22px; touch-action: none; cursor: pointer; }
.rs-ct .marker { position: absolute; top: 50%; width: 30px; height: 30px; margin: -15px 0 0 -15px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.5); pointer-events: none; }
.rs-order { display: flex; flex-direction: column; gap: 8px; }
.rs-order .rs-row { padding: 8px 8px 8px 14px; }
`;

export const cardStyles = `
ha-card { overflow: hidden; background: transparent; box-shadow: none; border: none; }
.rs-root { display: flex; flex-direction: column; gap: 10px; }
.rs-root .rs-room { min-height: 112px; }
.rs-root .rs-scene-row { padding-bottom: 2px; }
.rs-root .rs-scene-row .rs-scene .label { font-size: 13px; }
.rs-card-empty { padding: 16px; color: var(--secondary-text-color); }
`;
