# AGENTS.md

## Project

`oc-context-grid` — an OpenCode TUI plugin that renders context-window usage as a
pixel grid (a sidebar mini-grid and a full-screen `/contextgrid` view). See
`README.md` for behaviour, options and design details.

## Commands

- `bun install` — install dependencies
- `bun test` — run the test suites in `test/`

Run `bun test` after any change and make sure it passes before finishing.

## Layout

- `src/index.tsx` — plugin entry: slot registration, route, keymap, slash command
- `src/data.ts` — context extraction from reactive TUI state, first-request residual
- `src/breakdown.ts` — chars/4 category estimator
- `src/grid.ts` — pure square allocation logic
- `src/format.ts` — token/cost/percent formatting
- `src/components/` — TUI views (`MiniGrid`, `FullView`, shared `Grid`, colours)
- `test/` — unit tests (grid, breakdown, data)

## Conventions

- TypeScript with JSX using `@opentui/solid` (see the `@jsxImportSource` pragma at
  the top of view files). Components use Solid reactivity — derive state with
  signals/memos, avoid polling.
- Keep the allocation maths in `src/grid.ts` pure and covered by tests; views should
  only render what the pure functions produce.
- Token totals come from provider-reported values; per-category numbers are
  estimates. Don't add tokenizer dependencies.
- Match the existing code style; keep comments minimal.
