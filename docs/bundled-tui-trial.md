# Bundled TUI packaging trial

## Status

Trial in progress on this branch. Steps 1–5 are complete: the failing baseline is
recorded (`bundled-tui-baseline.md`), the single-entry build, package contract and
smoke/fixture tests are in place, and the loader fixture passes including headless
reactive invalidation. Step 6 (the live TUI check on OpenCode 1.18.25) is pending.

Two deviations from the plan as written:

- Declaration output is disabled (`dts` removed from `tsup.config.ts`):
  rollup-plugin-dts is incompatible with the repo's TypeScript 7, and OpenCode
  loads the JS entry directly. Revisit if type publication is ever needed.
- The fixture's host stand-in must serve the Solid **client** build
  (`solid-js/dist/solid.js`). Plain Bun resolves `solid-js` to the SSR server
  build, whose effects are inert — the same failure class the trial targets.
  OpenCode's host supplies its own reactive instance, so this matches reality.

## Objective

Test whether publishing one precompiled TUI bundle makes the context-grid views reactive
when OpenCode installs the plugin from npm.

The trial should copy the relevant packaging pattern from
`opencode-subagent-statusline` without changing context extraction, grid allocation, or
component behaviour.

## Background

The npm package currently publishes raw, multi-file TSX. OpenCode loads the entrypoint
from its package cache, but the embedded Bun resolver can skip the extensionless child
imports and their runtime dependencies. Those child modules can then load the package's
Solid SSR build instead of OpenCode's reactive Solid instance.

A precompiled bundle changes the shape seen by OpenCode's runtime bridge. All local
components become part of one JavaScript entry, while direct imports of `solid-js` and
`@opentui/solid` remain available for the host to rewrite.

## Hypothesis

A single ESM bundle will update live on OpenCode 1.18.25 if it has these properties:

- JSX is compiled in Solid `universal` mode for OpenTUI.
- All project source modules are bundled into one TUI entry.
- Code splitting is disabled.
- `solid-js`, `@opentui/solid`, and other host runtime packages remain external.
- The published `./tui` export points to the compiled JavaScript entry.
- The npm package contains the bundle instead of raw TSX source.

This approach does not embed another Bun, Solid, or OpenTUI runtime. It exposes direct
runtime imports so OpenCode can supply its existing instances.

## Scope

The trial may change only build and package-delivery concerns:

- build dependencies and scripts;
- a bundler configuration;
- package exports and published files;
- packaging tests or smoke-test fixtures;
- documentation needed to run and assess the trial.

The trial must not change:

- context token calculations;
- category estimation;
- grid allocation or rendering semantics;
- commands, routes, key bindings, or options;
- polling behaviour;
- the OpenCode or OpenTUI source trees.

## Proposed approach

### 1. Establish the failing baseline

Before changing the package, record the current behaviour on OpenCode 1.18.25 when the
plugin is installed through an npm-style package directory:

1. Open a session with existing usage.
2. Confirm that the sidebar initially shows a mount-time snapshot.
3. Start an assistant response and confirm that the grid remains unchanged.
4. Open and close `/contextgrid` and confirm that remounting refreshes the snapshot once.
5. Record the embedded Bun version from the OpenCode executable.

Keep this baseline separate from local source-path testing. A path outside
`node_modules` uses a different loading path and is not an equivalent control.

### 2. Add a single-entry TUI build

Use `tsup` with `esbuild-plugin-solid`, following the working packaging shape used by
`opencode-subagent-statusline`.

The intended configuration is conceptually:

```ts
export default defineConfig({
  entry: { tui: "src/index.tsx" },
  format: ["esm"],
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
    solidPlugin({
      solid: {
        generate: "universal",
        moduleName: "@opentui/solid",
      },
    }),
  ],
});
```

This is an illustrative target, not a final configuration. The implementation should
confirm the supported build target and declaration-output requirements before adopting
it.

### 3. Change the package contract

The trial package should:

- export `./dist/tui.js` from `./tui`;
- publish `dist` instead of `src`;
- run the build before packing;
- retain the existing OpenCode engine requirement;
- retain host runtime packages as peer dependencies where appropriate.

A packed tarball must not depend on project-local source paths or an unpublished build
step at OpenCode startup.

### 4. Inspect the generated artefact

Before running OpenCode, inspect `dist/tui.js` and the packed tarball. Verify that:

- the entry is valid ESM JavaScript;
- it contains no uncompiled JSX;
- local component and data modules are included in the bundle;
- it contains direct imports of `solid-js` and `@opentui/solid`;
- those host runtime packages are not copied into the bundle;
- it does not contain imports of `src/components/*` or other project source files;
- the tarball's `package.json` resolves `./tui` to the compiled entry;
- the tarball contains every file needed at runtime.

Add an automated package smoke test for these properties if the initial artefact is
promising.

### 5. Test through an npm-style installation

Install the packed tarball into the same directory shape OpenCode uses for registry
packages. Do not rely only on importing `dist/tui.js` from the repository checkout.

The smoke test should establish that:

1. OpenCode discovers and activates the TUI plugin.
2. The sidebar and `/contextgrid` route both render.
3. The components receive the host's reactive Solid runtime.
4. Message and session state changes invalidate the existing memos.
5. No duplicate-renderer or missing-renderer error appears.

Where practical, include a small loader-level fixture that imports the packed entry from
under `node_modules`. The fixture should prove runtime identity or reactive invalidation
without requiring a model request.

### 6. Perform the live TUI check

Run the decisive manual test on OpenCode 1.18.25:

1. Install the packed trial package through `tui.json`.
2. Open a session with prior token usage.
3. Start an assistant response.
4. Watch the sidebar while the response streams and completes.
5. Open `/contextgrid` and repeat the test.
6. Confirm that token totals, percentage, cost, categories, and squares update without a
   remount.
7. Confirm that disabling the sidebar option still works.
8. Restart OpenCode and repeat once to rule out a warm-cache artefact.

## Verification matrix

| Check | Source package | Bundled trial | Required result |
| --- | --- | --- | --- |
| Unit tests | Current | Trial | Both pass |
| Typecheck | Current | Trial | Both pass |
| Markdown lint | Current | Trial | Both pass |
| Direct local path | Control | Control | Behaviour recorded |
| npm-style package path | Frozen baseline | Trial | Trial updates live |
| Sidebar streaming | Frozen baseline | Trial | Trial updates live |
| Full-view streaming | Frozen baseline | Trial | Trial updates live |
| Restart and cold cache | Frozen baseline | Trial | Trial remains reactive |

## Success criteria

The trial succeeds only if all of these conditions hold:

- The packed npm-style installation updates both views without remounting.
- Existing unit tests and typechecking pass without suppressions.
- The bundle uses OpenCode's runtime instances rather than embedding duplicate copies.
- No polling is introduced.
- Existing commands, routes, options, formatting, and calculations remain unchanged.
- The package can be built reproducibly during release.

Passing a direct import test alone is insufficient. Passing only from a local path
outside `node_modules` is also insufficient.

## Failure investigation

If the bundled package still freezes, inspect these possibilities in order:

1. The generated entry does not directly import all required host runtime modules.
2. A build step bundled `solid-js` or `@opentui/solid` despite the external list.
3. OpenCode resolved a different package export than the inspected entry.
4. The npm cache installed incompatible or duplicate peer dependencies.
5. The slot renders with the correct Solid instance but a different OpenTUI renderer.
6. OpenCode events update state, but the TUI does not request or schedule a render.
7. Bun's runtime bridge fails for the compiled entry even though its imports are direct.

Instrument runtime identity and signal invalidation only in the trial fixture. Do not
leave diagnostic logging in the released plugin.

## Risks

- The workaround depends on OpenCode and OpenTUI loader behaviour that is not a stable
  public package contract.
- A future OpenTUI release may require a different JSX transform or peer range.
- Bundling can conceal accidental dependencies unless the packed artefact is inspected.
- Declaration generation may require a separate TypeScript configuration.
- A successful test on one platform may not cover Bun loader differences elsewhere.
- The workaround may become unnecessary after Bun fixes the resolver issue.

## Rollback

Keep the trial in one focused commit or pull request. If it fails:

1. Do not publish the trial package under `latest`.
2. Revert the build configuration, scripts, export, and file-list changes together.
3. Retain the recorded baseline and failure evidence in the pull request or an issue.
4. Leave the npm deprecation and dormant status unchanged.

If a prerelease is needed for realistic installation testing, use a distinct prerelease
version or npm tag and remove it from the documented installation path after the trial.

## Expected effort

The build and package changes should take less than an hour. Artefact checks, npm-style
installation, live streaming tests, and cold-cache verification are likely to bring the
total effort to two to four hours.

The trial should be treated as low implementation effort with moderate verification
risk.

## Decision after the trial

- **All success criteria pass:** prepare a production packaging pull request, remove the
  npm deprecation after release verification, and update the dormant status.
- **Rendering works but reactivity fails:** keep the project dormant and attach runtime
  identity evidence to the upstream issue.
- **The package does not load or render:** revert the trial and document the exact loader
  or export failure.
- **Results vary by platform or installation path:** do not publish as stable until the
  supported matrix is explicit and repeatable.
