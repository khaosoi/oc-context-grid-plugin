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

## What you get

- **Sidebar mini-grid** — a 10×3 grid plus a `20.5k/1M tokens (2%)` line, always visible
  in the session sidebar next to OpenCode's built-in Context panel.
- **Full view** — `/contextgrid` (alias `/ctx`) opens a 10×10 grid with a per-category
  legend (tokens and %), model, totals and cost. `esc` returns to your session.
- Both views update live as the session streams (reactive Solid state — no polling).

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

## Install (local development)

```sh
git clone <this-repo> ~/dev/oc-context-plugin
cd ~/dev/oc-context-plugin && bun install
```

Add to your project's `.opencode/tui.json` (or global `~/.config/opencode/tui.json`):

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [["/absolute/path/to/oc-context-plugin/src/index.tsx", {}]]
}
```

Restart OpenCode.

### Options

Pass options as the second tuple element in `tui.json`:

```json
"plugin": [["/path/to/oc-context-plugin/src/index.tsx", { "sidebar": false }]]
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `sidebar` | boolean | `true` | Show the mini-grid in the session sidebar |

Requires OpenCode >= 1.18 (TUI plugin slots, keymap layers and routes).

## Development

```sh
bun install
bun test   # unit tests for the grid, breakdown and system-residual maths
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
