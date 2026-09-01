# Bundled TUI trial — failing baseline record

Evidence gathered on 2026-06-14 for the trial described in
`bundled-tui-trial.md`, before any build changes. Environment: macOS arm64,
OpenCode 1.18.25 (`~/.bun/bin/opencode`), local Bun 1.4.0.

## The failing install shape

OpenCode installs npm-spec TUI plugins into an isolated tree. The cached
install of the current release (`0.2.2`, raw TSX) is at:

```
~/.cache/opencode/packages/@khaosoigai/oc-context-grid@latest/
├── package.json                      (wrapper: depends on @khaosoigai/oc-context-grid 0.2.2)
└── node_modules/
    ├── @khaosoigai/oc-context-grid/  (raw TSX source, ./tui → src/index.tsx)
    │   └── src/{index.tsx,data.ts,components/*,...}
    ├── solid-js/1.9.12               (private copy)
    ├── @opentui/solid/0.4.5          (private copy)
    ├── @opentui/core/…               (private copy)
    └── babel-preset-solid, s-js, …   (transitive)
```

The plugin therefore resolves `solid-js` and `@opentui/solid` to its own
private copies — a second Solid runtime instance alongside the host's. The
components render once (mount-time snapshot) and never invalidate because
memos built on the plugin's Solid instance cannot track signals created by
the host's Solid instance.

## Root-cause chain (static evidence)

1. **Embedded Bun 1.3.x**: recorded from the diagnostic session that produced
   the npm deprecation (OpenCode logs, 2026-08-31, run `dd4b9dad`), which cites
   `oven-sh/bun#40397`. The issue is reproduced against OpenCode's own runtime
   on Bun 1.3.14. (`strings` on the binary is inconclusive; treat 1.3.x as
   recorded-not-verified locally.)
2. **bun#40397 / #40398**: runtime `Bun.plugin` `onResolve` does not run for
   bare extensionless specifiers that are dependencies of dynamically imported
   modules (the TUI plugin entry is dynamically imported). The host bridge
   that should rewrite `solid-js` / `@opentui/*` imports onto host instances
   is therefore inert for plugin imports on Bun 1.3.x; imports fall through to
   normal node_modules resolution → the private copies above.
3. **anomalyco/opencode#33884** (and #32996): npm-spec TUI plugins load an
   isolated `@opentui/solid`; OpenTUI's Solid JSX transform additionally skips
   files under `node_modules`, so raw-TSX plugins compile via Bun native JSX
   against the plugin's private `jsx-runtime`. Same plugin from a `file://`
   path outside `node_modules` is bridged unconditionally and works.
4. Consequence for this plugin: it renders (0.4.x ships a real `jsx-runtime`),
   but every `createMemo` runs on the private Solid instance, so host state
   updates never invalidate it — matching the observed snapshot behaviour.

## Trial implication

Bundling removes the child-module files and precompiles JSX, leaving only
bare `solid-js` / `@opentui/solid` imports in the single entry. If OpenCode's
host-module registration (exact-specifier `build.module()` enumeration, which
bun#40397 confirms still works under the bug) covers those specifiers, the
bundle receives the host's instances and reactivity returns. If the bridge is
unconditionally inert for npm-spec plugins on 1.18.25, the bundle will freeze
exactly as the raw TSX does — that is the live test.

## Comparison: opencode-kimi-full (not counter-evidence)

`opencode-kimi-full@1.4.0` publishes raw TSX with private `@opentui/*` copies
and renders fine — but it imports **no runtime `solid-js`** (types only),
creates no memos or signals, takes plain props, and re-derives everything at
render time. It is a snapshot renderer by construction and so is unaffected by
instance skew. It also uses explicit `.ts` extensions on local imports,
consistent with the resolver-strictness of the embedded runtime.

## Recorded baseline behaviour (from prior live sessions)

- Sidebar shows a mount-time snapshot; grid unchanged while a response
  streams and completes.
- `/contextgrid` likewise frozen; closing and reopening remounts and
  refreshes the snapshot once.
- Local-source install via `file://` outside `node_modules` is reactive —
  confirming the code is correct and the delivery path is the variable.
