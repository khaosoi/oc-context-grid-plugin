import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const pkg = JSON.parse(
  readFileSync(path.join(import.meta.dir, "../package.json"), "utf8")
);

// OpenCode skips node_modules in its Solid transform, so npm installs must
// load the precompiled bundle rather than the TypeScript sources.
test("publishes the precompiled TUI bundle", () => {
  expect(pkg.exports["./tui"]).toBe("./dist/index.js");
  expect(pkg.files).toContain("dist");
  expect(pkg.scripts.prepack).toBe("bun run build");
});
