import { solidPlugin } from "esbuild-plugin-solid";
import { defineConfig } from "tsup";

// Single-entry TUI bundle for the OpenCode runtime bridge (see
// docs/bundled-tui-trial.md). All local modules are inlined; the host
// runtime packages stay external so OpenCode can supply its own instances.
export default defineConfig({
  entry: { tui: "src/index.tsx" },
  format: ["esm"],
  target: "node22",
  // dts disabled: rollup-plugin-dts (tsup's declaration path) is incompatible
  // with the repo's TypeScript 7. OpenCode loads the JS entry directly, so no
  // declarations are needed at runtime; revisit if type publication is wanted.
  bundle: true,
  splitting: false,
  clean: true,
  outDir: "dist",
  external: [
    "@opencode-ai/plugin",
    "@opencode-ai/plugin/tui",
    "@opentui/core",
    "@opentui/solid",
    "solid-js",
  ],
  esbuildPlugins: [
    solidPlugin({ solid: { generate: "universal", moduleName: "@opentui/solid" } }),
  ],
});
