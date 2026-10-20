/**
 * Builds the published TUI entry.
 *
 * OpenCode compiles local plugin sources with the OpenTUI Solid transform,
 * but skips every file under `node_modules`. A package that ships `.tsx`
 * therefore renders as plain Solid-free JSX when installed from npm: the
 * views mount once and never update. Ship a bundle that was already
 * transformed instead.
 */
import { rm } from "node:fs/promises";
import solidPlugin from "@opentui/solid/bun-plugin";

const OUTDIR = "dist";

await rm(OUTDIR, { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: ["src/index.tsx"],
  outdir: OUTDIR,
  target: "bun",
  format: "esm",
  external: ["solid-js", "@opentui/solid", "@opencode/plugin/tui"],
  plugins: [solidPlugin]
});

if (!result.success) {
  for (const log of result.logs) console.error(log.level, log.message);
  process.exit(1);
}

const output = result.outputs.find((item) => item.path.endsWith("/index.js"));
if (!output) {
  console.error("build produced no dist/index.js");
  process.exit(1);
}

const code = await output.text();
// The universal Solid transform emits helper imports from @opentui/solid and
// `_$insert`-style calls. Bun's automatic JSX runtime instead emits
// `jsx-runtime` imports and evaluates children eagerly, which is the static
// mount-time snapshot this build exists to prevent.
if (!code.includes('from "@opentui/solid"') || code.includes("jsx-runtime")) {
  console.error("dist/index.js was not compiled with the OpenTUI Solid transform");
  process.exit(1);
}

console.log(`built ${output.path} (${(code.length / 1024).toFixed(1)} kB)`);
