import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");
const common = {
  bundle: true,
  minify: !watch,
  sourcemap: false,
  format: "esm",
  target: "es2021",
  jsx: "automatic",
  jsxImportSource: "preact",
  logLevel: "info",
};
const builds = [
  { entryPoints: ["src/panel/index.tsx"], outfile: "custom_components/room_scenes/frontend/room_scenes_panel.js" },
  { entryPoints: ["src/card/index.tsx"], outfile: "custom_components/room_scenes/frontend/room_scenes_card.js" },
];
for (const b of builds) {
  const ctx = await esbuild.context({ ...common, ...b });
  if (watch) await ctx.watch();
  else { await ctx.rebuild(); await ctx.dispose(); }
}
