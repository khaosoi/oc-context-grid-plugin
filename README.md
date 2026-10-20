# oc-context-grid

A Claude Code-style context usage pixel-grid for the [OpenCode](https://opencode.ai) V2 TUI.

Renders the context window as a square made of little squares — `⛁` filled, `⛀` partially filled, `⛶` free space — coloured by usage category, just like Claude Code's `/context`:

```text
 Context Usage

 GLM-5.3-Flash · 14.2k/1M tokens (1%) · $0.00 spent

 ⛁ ⛀ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶   Estimated usage by category
 ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶   ⛁ System: 13.8k tokens (1.4%)
 ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶   ⛁ User: 33 tokens (0.0%)
 ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶   ⛁ Assistant: 195 tokens (0.0%)
 ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶   ⛁ Other: 134 tokens (0.0%)
 ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶   ⛶ Free space: 986k (98.6%)
```

## What you get

- **Sidebar mini-grid** — a 10×3 grid plus a `20.5k/1M tokens (2%)` line, always visible
  in the session sidebar next to OpenCode's built-in Context panel.
- **Full view** — `/contextgrid` (alias `/ctx`, or "Context Grid" in the command palette)
  opens a 10×10 grid with a per-category legend (tokens and %), model, totals and cost.
  `esc` returns to your session.
- Both views update **live** as the session streams — reactive reads from OpenCode's V2
  plugin data layer, no polling.

- Requires **OpenCode >= 2.0**. (The 0.2.x line targeted OpenCode 1.18 and was retired —
  see the note at the end.)

## Install

Add the package to the `plugins` list in your global `~/.config/opencode/cli.json`:

```json
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": ["@khaosoigai/oc-context-grid"]
}
```

OpenCode downloads and caches the package automatically at startup — no `bun add`
needed. Restart OpenCode and run `/ctx` (or find "Context Grid" in the command
palette, `ctrl+p`).

TUI plugins live in `cli.json`, which is the terminal client's own configuration —
a server-side entry in `opencode.json` will not load the TUI views.

### Options

Pass options as an object entry instead of a plain string:

```json
"plugins": [
  { "package": "@khaosoigai/oc-context-grid", "options": { "sidebar": false } }
]
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `sidebar` | boolean | `true` | Show the mini-grid in the session sidebar |

Omitting `sidebar` (or passing `{}`) leaves it on — the mini-grid shows unless you
explicitly pass `"sidebar": false`.

### Local development

```sh
git clone https://github.com/khaosoi/oc-context-grid-plugin ~/dev/oc-context-grid-plugin
cd ~/dev/oc-context-grid-plugin && bun install
```

Point OpenCode at the checkout — the loader resolves a plugin **directory** against a
root-level `tui.tsx` entry (a file-path entry is ignored by the V2 loader, so use the
directory), in global `~/.config/opencode/cli.json`:

```json
"plugins": ["/absolute/path/to/oc-context-grid-plugin"]
```

Restart OpenCode. Local plugin sources hot-reload on save, so the TUI picks up edits
without a restart in most cases. Local development loads `tui.tsx` and the TypeScript
sources directly; the npm package loads the precompiled bundle described below.

## How it works (no tokenizers)

- **Totals are authoritative**: `input + output + reasoning + cache.read + cache.write`
  from the last assistant message — the same formula OpenCode's sidebar and footer use.
  All numbers are reactive reads from the TUI plugin data layer (`context.data`), so the
  grid re-renders while a session streams.
- **Limit** comes from the model catalog (`ModelInfo.limit.context`).
- **Category breakdown** (system / user / assistant / tool / other) uses OpenCode's own
  chars/4 heuristic, scaled to the provider-reported total. No per-model tokenizers.
- **System** is estimated with the *first-request residual*: OpenCode doesn't persist the
  assembled system prompt, so the plugin takes the first turn's input-side tokens
  (`input + cache.read + cache.write`) and subtracts the user text that preceded it.
  That covers the real system prompt, tool definitions, rules files (AGENTS.md etc.) and
  environment context in one number.

## Categories

| Category | What it covers | Source |
| --- | --- | --- |
| **System** | System prompt, tool definitions, rules files (AGENTS.md), environment context — the fixed overhead of the first request | First-request residual (provider tokens minus leading user text) |
| **User** | Your prompt text | chars/4 over user message text (base64 attachments are not counted) |
| **Assistant** | Assistant text and reasoning output | chars/4 over text/reasoning content |
| **Tools** | Tool call inputs and results (arguments, output, errors) | chars/4 over tool content |
| **Other** | Whatever is left: output-side tokens, cache drift, estimation error | Remainder against the authoritative total |
| **Free space** | Unused window | `limit − total` |

## How the grid maps squares

- The full view is 100 squares (10×10), so each square is 1% of the context window; the
  sidebar mini-grid is 30 squares (10×3).
- Squares fill left-to-right, top-to-bottom in category order, then free space.
- A square straddling a category boundary takes the dominant (largest-overlap) category.
  It renders `⛁` when that category covers ≥ 70% of the square, otherwise `⛀`
  (the same threshold Claude Code uses).
- Colours follow your OpenCode theme: one slot of the theme's categorical scale per
  category, muted text for free space.

## Accuracy caveats

- Only the headline numbers (tokens, limit, percent, cost) are provider-reported. All
  per-category numbers are estimates, exactly like OpenCode's own context tab.
- **System** cannot be split into "system prompt" vs "tool definitions" — the assembled
  prompt only exists server-side at request time.
- After a `/compact`, the first request in view is the compacted summary, so **System**
  may absorb some summary content and read high until the session continues.
- Percentages are computed against the model of the *last* assistant message — switching
  models mid-session re-bases the grid to that model's window.

## Development

```sh
bun install
bun run build     # precompile the published entry into dist/
bun test          # unit tests for the grid, breakdown and system-residual maths
bun run typecheck # tsc --noEmit over src/, test/ and scripts/
```

### Packaging

The npm package ships a precompiled bundle at `dist/index.js`; `package.json` points
`exports["./tui"]` at it. OpenCode runs local plugin sources through the OpenTUI Solid
transform but excludes every path under `node_modules`, so a package that shipped `.tsx`
was loaded with Bun's automatic JSX runtime. That runtime evaluates JSX once, which is
why npm installs rendered mount-time snapshots until the sidebar remounted. `bun run
build` (also run by `prepack`) compiles the entry with the Solid transform and fails if
the output is not universal-mode JSX.

Layout:

```text
tui.tsx               # local-dev entrypoint: re-exports the plugin module
src/
  index.tsx           # plugin module: slots + route + slash command (V2 setup(ctx))
  data.ts             # context extraction from the reactive V2 data layer,
                      # first-request residual system estimate
  breakdown.ts        # chars/4 category estimator (ported from OpenCode)
  grid.ts             # pure square allocation (dominant category + fullness)
  format.ts           # token/cost/percent formatting
  components/
    colors.ts         # category -> theme colour mapping + labels
    Grid.tsx          # shared square rendering
    MiniGrid.tsx      # sidebar slot view
    FullView.tsx      # /contextgrid route view
scripts/
  build.ts            # precompiles src/ into dist/index.js (Solid transform)
test/                 # bun test suites (grid, breakdown, data)
```

## Note on the retired 0.2.x (OpenCode 1.18) releases

The 1.18-era package rendered mount-time snapshots rather than live views: an upstream
Bun resolver issue sent the plugin's `solid-js` imports to its SSR build, where
`createMemo` never subscribes, and the V1 TUI plugin API relied on TUI-internal state
rather than a documented reactive data layer. OpenCode 2.0 ships the
`@opencode/plugin/tui` API and a reactive data layer, which the 0.3.x releases target.

OpenCode 2.x still skips `node_modules` when applying its Solid transform. A TSX
package is therefore reactive only when loaded from a local checkout; npm installs need
the precompiled `dist/index.js`. If a view ever freezes until it remounts, check that
the install resolved to the bundle rather than the TypeScript sources.

## Licence

MIT
