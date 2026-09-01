import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { plugin } from "bun";
import { describe, expect, it, beforeAll, afterAll } from "bun:test";

/**
 * Loader-level fixture for the bundled TUI trial (docs/bundled-tui-trial.md,
 * step 5). Simulates the npm-spec install shape OpenCode uses
 * (~/.cache/opencode/packages/<scope>/<name>@spec/node_modules/<pkg>/) and the
 * host-module bridging OpenCode performs (exact-specifier registration, the
 * mechanism that still works while runtime onResolve is inert on embedded
 * Bun 1.3.x — oven-sh/bun#40397).
 *
 * The fixture proves that, from that shape:
 *   1. the packed bundle loads;
 *   2. its bare `solid-js` / `@opentui/solid` imports are answered by the
 *      registered host modules (not by the private copies npm installs
 *      alongside the plugin) — the identity property the trial hinges on;
 *   3. the plugin activates: slots, routes and keymaps register;
 *   4. the sidebar slot renders headlessly through the host stand-in runtime
 *      and invalidates when host-owned state signals update.
 */

// Host stand-ins. Registration must come first: `import "solid-js"` under Bun
// resolves to the SSR server build (node condition), whose effects are inert —
// mirroring exactly the class of failure the trial targets. OpenCode's host
// supplies its own reactive client build, so the fixture registers the client
// build (dist/solid.js) as the host module and lets @opentui/solid pick it up
// through the same interception.
const hostSolid = (await import(
  // @ts-expect-error direct JS path; declarations come from solid-js types
  "../node_modules/solid-js/dist/solid.js"
)) as typeof import("solid-js");

const servedByHost = new Set<string>();

plugin({
  name: "host-modules-fixture",
  setup(build) {
    for (const spec of [
      "solid-js",
      "solid-js/store",
      "@opentui/solid",
      "@opentui/solid/jsx-runtime",
      "@opencode-ai/plugin",
      "@opencode-ai/plugin/tui"
    ]) {
      build.module(spec, () => {
        servedByHost.add(spec);
        const exports =
          spec === "solid-js"
            ? hostSolid
            : spec.startsWith("@opentui/solid")
              ? hostOpenTuiSolid
              : {};
        return { exports, loader: "object" };
      });
    }
  }
});

const hostOpenTuiSolid = (await import(
  // @ts-expect-error direct JS path; declarations come from @opentui/solid types
  "../node_modules/@opentui/solid/index.bun.js"
)) as typeof import("@opentui/solid");

type SlotRender = (ctx: unknown, props: unknown) => unknown;

type Recorded = {
  slots: { order: number; slots: Record<string, SlotRender> }[];
  routes: unknown[];
  keymaps: unknown[];
};

function makeStubApi(reactive: boolean): { api: Record<string, unknown>; recorded: Recorded; setMessages?: (m: unknown[]) => void } {
  const recorded: Recorded = { slots: [], routes: [], keymaps: [] };
  const provider = [
    {
      id: "prov1",
      name: "TestProvider",
      models: { "test-model": { name: "Test Model", limit: { context: 200_000 } } }
    }
  ];

  let state: Record<string, unknown>;
  let setMessages: ((m: unknown[]) => void) | undefined;

  if (reactive) {
    // Host-owned reactive state, built on the same Solid instance the plugin
    // receives — mirroring OpenCode's TUI state.
    const [messages, setMessages_] = hostSolid.createSignal<unknown[]>([]);
    setMessages = setMessages_;
    state = {
      session: {
        messages: (id: string) => messages().filter(() => id === "ses_test"),
        get: () => ({ cost: 0.01 })
      },
      provider,
      part: () => undefined
    };
  } else {
    state = {
      session: { messages: () => [], get: () => undefined },
      provider,
      part: () => undefined
    };
  }

  const api = {
    slots: {
      register: (reg: Recorded["slots"][number]) => recorded.slots.push(reg)
    },
    route: {
      register: (routes: unknown[]) => recorded.routes.push(...routes),
      current: { name: "session", params: { sessionID: "ses_test" } },
      navigate: () => {}
    },
    keymap: { registerLayer: (layer: unknown) => recorded.keymaps.push(layer) },
    mode: { push: () => () => {} },
    theme: { current: { text: "#ffffff", textMuted: "#888888" } },
    state
  };
  return { api, recorded, setMessages };
}

type PluginModule = {
  default: {
    id: string;
    tui: (api: unknown, opts?: unknown) => Promise<void>;
  };
};

let installDir: string;
let entryPath: string;

beforeAll(() => {
  // Pack and install into an OpenCode-like cache shape: the wrapper root has a
  // node_modules containing the plugin plus npm's auto-installed peer copies,
  // exactly like the failing baseline tree.
  installDir = mkdtempSync(join(tmpdir(), "oc-context-grid-install-"));
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  execSync(`npm pack --pack-destination "${installDir}"`, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "ignore"
  });
  const tarball = join(
    installDir,
    `${pkg.name.replace("@", "").replace("/", "-")}-${pkg.version}.tgz`
  );
  writeFileSync(
    join(installDir, "package.json"),
    JSON.stringify({ name: "cache-root", private: true })
  );
  execSync(
    `npm install --no-audit --no-fund --loglevel=error --ignore-scripts "${tarball}"`,
    { cwd: installDir, encoding: "utf8", stdio: "pipe" }
  );
  entryPath = join(
    installDir,
    "node_modules/@khaosoigai/oc-context-grid/dist/tui.js"
  );
}, 60_000);

afterAll(() => {
  rmSync(installDir, { recursive: true, force: true });
});

describe("npm-style install loader fixture", () => {
  it("installed the tarball with private host-runtime copies alongside it", () => {
    expect(entryPath).toContain(
      join("node_modules", "@khaosoigai", "oc-context-grid", "dist", "tui.js")
    );
    const rootModules = execSync(`ls "${join(installDir, "node_modules")}"`, {
      encoding: "utf8"
    });
    // Same shape as the failing baseline: private solid-js is resolvable from
    // the plugin directory by normal node_modules traversal.
    expect(rootModules).toContain("solid-js");
    expect(rootModules).toContain("@opentui");
  });

  it("loads the bundle with host modules served by registration, not node_modules", async () => {
    const mod = (await import(entryPath)) as PluginModule;
    expect(servedByHost.has("solid-js")).toBe(true);
    expect(servedByHost.has("@opentui/solid")).toBe(true);
    expect(mod.default.id).toBe("oc-context-grid");
    expect(typeof mod.default.tui).toBe("function");
  });

  it("activates the plugin against a stub host API", async () => {
    const mod = (await import(entryPath)) as PluginModule;
    const { api, recorded } = makeStubApi(false);
    await mod.default.tui(api, {});
    expect(recorded.slots).toHaveLength(1);
    expect(Object.keys(recorded.slots[0].slots)).toContain("sidebar_content");
    expect(recorded.routes.length).toBeGreaterThan(0);
    expect(recorded.keymaps).toHaveLength(2);
  });

  it("renders and reactively updates through the host stand-in runtime", async () => {
    const mod = (await import(entryPath)) as PluginModule;
    const { api, recorded, setMessages } = makeStubApi(true);
    await mod.default.tui(api, {});
    const render = recorded.slots[0].slots["sidebar_content"];

    const setup = await hostOpenTuiSolid.testRender(() =>
      render({}, { session_id: "ses_test" }) as never
    );
    try {
      // Empty state first.
      await setup.renderOnce();
      expect(setup.captureCharFrame()).toContain("no usage yet");

      // Host state changes; the plugin's memo must invalidate and re-render
      // without any remount.
      setMessages!([
        {
          role: "assistant",
          providerID: "prov1",
          modelID: "test-model",
          tokens: {
            input: 5000,
            output: 500,
            reasoning: 0,
            cache: { read: 0, write: 0 }
          }
        }
      ]);
      await setup.waitForFrame((frame) => frame.includes("tokens"));
      const frame = setup.captureCharFrame();
      expect(frame).toContain("Context grid");
      expect(frame).toContain("5.5k/200k tokens");
      expect(frame).toContain("(3%)");
    } finally {
      setup.renderer.destroy?.();
    }
  });
});
