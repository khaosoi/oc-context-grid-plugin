# AGENTS.md

## Project

`oc-context-grid` — an OpenCode TUI plugin that renders context-window usage as a
pixel grid (a sidebar mini-grid and a full-screen `/contextgrid` view). See
`README.md` for behaviour, options and design details.

## Commands

- `bun install` — install dependencies
- `bun test` — run the test suites in `test/`
- `bun run typecheck` — typecheck with `tsc --noEmit`

Run `bun test` and `bun run typecheck` after any change and make sure they pass
before finishing. CI (`.github/workflows/ci.yml`) runs both on PRs and pushes to
`main`.

## Layout

- `src/index.tsx` — plugin entry: slot registration, route, keymap, slash command
- `src/data.ts` — context extraction from reactive TUI state, first-request residual
- `src/breakdown.ts` — chars/4 category estimator
- `src/grid.ts` — pure square allocation logic
- `src/format.ts` — token/cost/percent formatting
- `src/components/` — TUI views (`MiniGrid`, `FullView`, shared `Grid`, colours)
- `test/` — unit tests (grid, breakdown, data)
- `.github/workflows/` — CI (`ci.yml`), release-please + npm publish (`release.yml`)
- `release-please-config.json` / `.release-please-manifest.json` — release-please config

## Releases

- Commit messages must follow conventional commits (`feat:`, `fix:`, `docs:`, …) —
  release-please derives versions and `CHANGELOG.md` from them.
- On merge to `main`, release-please opens a release PR (`chore: release vX.Y.Z`).
  Merging it tags the release, cuts a GitHub Release and publishes
  `@khaosoigai/oc-context-grid` to npm via trusted publishing (OIDC, no registry
  token). Needs the `RELEASE_APP_ID` / `RELEASE_APP_PRIVATE_KEY` repo secrets.

## Conventions

- TypeScript with JSX using `@opentui/solid` (see the `@jsxImportSource` pragma at
  the top of view files). Components use Solid reactivity — derive state with
  signals/memos, avoid polling.
- Keep the allocation maths in `src/grid.ts` pure and covered by tests; views should
  only render what the pure functions produce.
- Token totals come from provider-reported values; per-category numbers are
  estimates. Don't add tokenizer dependencies.
- Match the existing code style; keep comments minimal.
