# oc-context-grid

A Claude Code-style context usage pixel-grid for the [OpenCode](https://opencode.ai) TUI.

Renders the context window as a square made of little squares — `⛁` filled, `⛀` partially
filled, `⛶` free space — coloured by usage category, just like Claude Code's `/context`:

```text
Context Usage
GLM-5.3-Flash · 20.5k/1M tokens (2%) · $0.00 spent

⛁ ⛁ ⛀ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶   Estimated usage by category
⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶   ⛁ System: 20.4k tokens (2.0%)
⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶ ⛶   ⛁ User: 7 tokens (0.0%)
...                            ⛁ Assistant: 21 tokens (0.0%)
                               ⛶ Free space: 980k (98.0%)
```

## Status: dormant pending upstream Bun resolver fix

**Deprecated on npm; the repository remains public.**

The published package installs and renders on OpenCode 1.18.x, but its views are
snapshots created when they mount. Loading the source from a local path outside
`node_modules` uses a different loader path and is not known to have this failure.

### Root cause

- OpenCode uses `ensureRuntimePluginSupport`, a runtime `Bun.plugin`, to bridge external
  imports of `solid-js` and `@opentui/solid` to the host's bundled instances. The bridge
  works when OpenTUI can inspect and rewrite the importing file. This is why some
  precompiled, single-file TUI plugins remain reactive on the same OpenCode release.
- This package instead publishes several raw TSX files. Its entrypoint imports the view
  components through extensionless relative paths; those components import `createMemo`
  from `solid-js`.
- [oven-sh/bun#40397](https://github.com/oven-sh/bun/issues/40397) causes runtime
  `onResolve` hooks to skip extensionless specifiers, including bare package imports.
  OpenTUI can rewrite the runtime imports visible in the entrypoint, but it does not reach
  the child components before Bun loads them.
- The child imports therefore resolve to the package's own
  `node_modules/solid-js/dist/server.js`. That SSR build evaluates `createMemo` once and
  creates no reactive subscription, which explains the mount-time snapshots.

[oven-sh/bun#40398](https://github.com/oven-sh/bun/pull/40398) proposes the required
resolver change. Do not use Bun 1.4 as the compatibility boundary: Bun 1.4.0 still
reproduces the bug, and the pull request was not part of that release. The plugin becomes
viable from npm once OpenCode embeds a Bun build that contains the resolver fix, or its
package is changed so all TUI runtime imports can be bridged from the entrypoint.

### Symptoms (npm package on OpenCode 1.18.25, embedded Bun 1.3.14)

- The sidebar mini-grid shows `no usage yet` until you open and close `/contextgrid`.
  Remounting computes the current value once, then the view freezes again.
- The full `/contextgrid` view initially looks correct but is likewise a snapshot.
- OpenCode's built-in "Context" sidebar block updates live because it is bundled with the
  host.

### How to check whether a given OpenCode build will work

```sh
strings "$(readlink -f "$(command -v opencode)")" | grep -m1 "Bun v"
```

- **Bun 1.3.x or 1.4.0** → the published package is affected.
- **A later Bun version** → the version alone is inconclusive; confirm that its release
  contains the fix for `oven-sh/bun#40397`.

The decisive check is an in-app test. Open a session with existing usage and watch the
sidebar mini-grid while an assistant reply streams. A changing grid is reactive; a frozen
grid is still affected.

## What you get

- **Sidebar mini-grid** — a 10×3 grid plus a `20.5k/1M tokens (2%)` line, always visible
  in the session sidebar next to OpenCode's built-in Context panel.
- **Full view** — `/contextgrid` (alias `/ctx`) opens a 10×10 grid with a per-category
  legend (tokens and %), model, totals and cost. `esc` returns to your session.
- Both views update live as the session streams (reactive Solid state — no polling) —
  **only** on unaffected OpenCode builds; see the status section above.

## How it works (no tokenizers)

- **Totals are authoritative**: `input + output + reasoning + cache.read + cache.write`
  from the last assistant message — the same formula OpenCode's sidebar and footer use.
- **Limit** comes from the model catalog (`provider.models[id].limit.context`).
- **Category breakdown** (system / user / assistant / tool / other) uses OpenCode's own
  chars/4 heuristic, scaled to the provider-reported total. No per-model tokenizers needed.
- **System** is estimated with the *first-request residual*: OpenCode doesn't persist the
  assembled system prompt, so the plugin takes the first turn's input-side tokens
  (`input + cache.read + cache.write`) and subtracts the user content that preceded it.
  That covers the real system prompt, tool definitions, rules files (AGENTS.md etc.) and
  environment context in one number. If a session carries an explicit per-message system
  prompt override, its chars/4 estimate is used instead.

## Categories

| Category | What it covers | Source |
| --- | --- | --- |
| **System** | System prompt, tool definitions, rules files (AGENTS.md), environment context — the fixed overhead of the first request | First-request residual (provider tokens minus leading user content) |
| **User** | Your messages (text, file and agent attachment content) | chars/4 over user parts |
| **Assistant** | Assistant text and reasoning output | chars/4 over text/reasoning parts |
| **Tools** | Tool call inputs and results (arguments, output, errors) | chars/4 over tool parts |
| **Other** | Whatever is left: output-side tokens, cache drift, estimation error | Remainder against the authoritative total |
| **Free space** | Unused window | `limit − total` |

## How the grid maps squares

- The full view is 100 squares (10×10), so each square is 1% of the context window; the
  sidebar mini-grid is 30 squares (10×3).
- Squares fill left-to-right, top-to-bottom in category order, then free space.
- A square straddling a category boundary takes the dominant (largest-overlap) category.
  It renders `⛁` when that category covers ≥ 70% of the square, otherwise `⛀`
  (the same threshold Claude Code uses).
- Colours follow your OpenCode theme (system → info, user → success, assistant → primary,
  tool → warning, other → comment, free → muted).

## Accuracy caveats

- Only the headline numbers (tokens, limit, percent, cost) are provider-reported. All
  per-category numbers are estimates, exactly like OpenCode's own context tab.
- **System** cannot be split into "system prompt" vs "tool definitions" — the assembled
  prompt only exists server-side at request time. (Splitting it would need a companion
  server plugin hooking `experimental.chat.system.transform`.)
- After a `/compact`, the first request in view is the compacted summary, so **System**
  may absorb some summary content and read high until the session continues.
- Percentages are computed against the model of the *last* assistant message — switching
  models mid-session re-bases the grid to that model's window.

## Install

Requires OpenCode >= 1.18 (TUI plugin slots, keymap layers and routes) built on
**Bun >= 1.4** — check with the `strings` command in the status section above first.

Add to your project's `.opencode/tui.json` (or global `~/.config/opencode/tui.json`):

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [["@khaosoigai/oc-context-grid", {}]]
}
```

OpenCode installs the package automatically at startup (cached under
`~/.cache/opencode/`) — no `bun add` needed.

Restart OpenCode.

### Options

Pass options as the second tuple element in `tui.json`:

```json
"plugin": [["@khaosoigai/oc-context-grid", { "sidebar": false }]]
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

Point the plugin entry at the source instead — project `.opencode/tui.json`
or global `~/.config/opencode/tui.json`:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [["/absolute/path/to/oc-context-grid-plugin/src/index.tsx", {}]]
}
```

Restart OpenCode.

## Development

```sh
bun install
bun test          # unit tests for the grid, breakdown and system-residual maths
bun run typecheck # tsc --noEmit over src/ and test/
```

Layout:

```text
src/
  index.tsx            # plugin module: slots + route + slash command
  data.ts              # context extraction from reactive TUI state,
                       # first-request residual system estimate
  breakdown.ts         # chars/4 category estimator (ported from OpenCode)
  grid.ts              # pure square allocation (dominant category + fullness)
  format.ts            # token/cost/percent formatting
  components/
    colors.ts          # category -> theme colour mapping + labels
    Grid.tsx           # shared square rendering
    MiniGrid.tsx       # sidebar slot view
    FullView.tsx       # /contextgrid route view
test/                  # bun test suites (grid, breakdown, data)
```

## Licence

MIT
