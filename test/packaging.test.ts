import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, beforeAll, afterAll } from "bun:test";

/**
 * Packaging smoke test for the bundled TUI trial (docs/bundled-tui-trial.md,
 * step 4). Verifies the artefact properties the OpenCode runtime bridge
 * depends on. Run `bun run build` first (CI does; prepack also does).
 */

const BUNDLE = "dist/tui.js";

function readBundle(): string {
  return readFileSync(BUNDLE, "utf8");
}

describe("bundle artefact", () => {
  it("exists and is non-trivial", () => {
    const src = readBundle();
    expect(src.length).toBeGreaterThan(5000);
  });

  it("directly imports the host runtime packages", () => {
    const src = readBundle();
    expect(src).toMatch(/from "solid-js"/);
    expect(src).toMatch(/from "@opentui\/solid"/);
  });

  it("contains no uncompiled JSX", () => {
    const src = readBundle();
    expect(src).not.toMatch(/<box|<text|<group/);
    expect(src).not.toMatch(/@jsxImportSource/);
  });

  it("inlines all local source modules", () => {
    const src = readBundle();
    for (const marker of [
      "getContextData",
      "computeGrid",
      "estimateBreakdown",
      "formatTokens",
      "MiniGrid",
      "FullView"
    ]) {
      expect(src).toContain(marker);
    }
  });

  it("has no project-source or relative imports", () => {
    const src = readBundle();
    expect(src).not.toMatch(/from "\.\//);
    expect(src).not.toMatch(/from "src\//);
    expect(src).not.toMatch(/from "[^"]*\/src\/components/);
  });

  it("does not bundle the host runtime packages", () => {
    const src = readBundle();
    expect(src).not.toMatch(/from "[^"]*node_modules\/solid-js/);
    expect(src).not.toMatch(/from "[^"]*node_modules\/@opentui/);
  });
});

describe("packed tarball", () => {
  let dir: string;
  let paths: string[];

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "oc-context-grid-pack-"));
    execSync(`npm pack --pack-destination "${dir}"`, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: "ignore"
    });
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    const tarball = join(
      dir,
      `${pkg.name.replace("@", "").replace("/", "-")}-${pkg.version}.tgz`
    );
    const listing = execSync(`tar -tzf "${tarball}"`, { encoding: "utf8" });
    paths = listing
      .split("\n")
      .filter(Boolean)
      .map((p) => p.replace(/^package\//, ""));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("resolves ./tui to the compiled entry", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.exports["./tui"]).toBe("./dist/tui.js");
    expect(pkg.files).toContain("dist");
    expect(pkg.files).not.toContain("src");
  });

  it("ships the bundle and no raw source", () => {
    expect(paths).toContain("dist/tui.js");
    expect(paths.some((p) => p.startsWith("src/"))).toBe(false);
    expect(paths.some((p) => p.endsWith(".tsx"))).toBe(false);
  });
});
