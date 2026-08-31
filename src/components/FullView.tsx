/** @jsxImportSource @opentui/solid */
import { createMemo } from "solid-js";
import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import { getContextData } from "../data";
import { computeGrid, GLYPH_FREE, GLYPH_FULL } from "../grid";
import { formatCost, formatTokens } from "../format";
import { Grid } from "./Grid";
import { CATEGORY_LABEL, categoryColor } from "./colors";

const COLUMNS = 10;
const SQUARES = 100; // 10 x 10

export function FullView(props: { api: TuiPluginApi; sessionID?: string }) {
  const theme = () => props.api.theme.current;
  const data = createMemo(() =>
    props.sessionID ? getContextData(props.api, props.sessionID) : undefined
  );

  const squares = createMemo(() => {
    const ctx = data();
    if (!ctx?.limit) return [];
    return computeGrid({
      segments: ctx.segments,
      limit: ctx.limit,
      squaresTotal: SQUARES
    });
  });

  const free = createMemo(() => {
    const ctx = data();
    if (!ctx?.limit) return 0;
    return Math.max(0, ctx.limit - ctx.tokens);
  });

  const percentOf = (tokens: number, limit: number) =>
    limit ? ((tokens / limit) * 100).toFixed(1) : "0.0";

  return (
    <box flexDirection="column" padding={1} gap={1}>
      <text fg={theme().text}>
        <b>Context Usage</b>
      </text>
      {data() === undefined ? (
        <text fg={theme().textMuted}>
          {props.sessionID
            ? "No usage yet — send a message first."
            : "No session selected."}
        </text>
      ) : (
        <>
          <text fg={theme().textMuted}>
            {data()!.modelLabel} · {formatTokens(data()!.tokens)}/
            {formatTokens(data()!.limit)} tokens ({data()!.percent ?? 0}%) ·{" "}
            {formatCost(data()!.cost)} spent
          </text>
          <box flexDirection="row" gap={2}>
            <box flexShrink={0}>
              <Grid squares={squares()} columns={COLUMNS} theme={theme} />
            </box>
            <box flexDirection="column">
              <text fg={theme().textMuted}>Estimated usage by category</text>
              {data()!.segments.map((segment) => (
                <text>
                  <span style={{ fg: categoryColor(theme(), segment.key) }}>
                    {GLYPH_FULL}{" "}
                  </span>
                  <span style={{ fg: theme().text }}>
                    {CATEGORY_LABEL[segment.key]}:{" "}
                  </span>
                  <span style={{ fg: theme().textMuted }}>
                    {formatTokens(segment.tokens)} tokens (
                    {percentOf(segment.tokens, data()!.limit)}%)
                  </span>
                </text>
              ))}
              {free() > 0 && (
                <text>
                  <span style={{ fg: categoryColor(theme(), "free") }}>
                    {GLYPH_FREE}{" "}
                  </span>
                  <span style={{ fg: theme().text }}>Free space: </span>
                  <span style={{ fg: theme().textMuted }}>
                    {formatTokens(free())} ({percentOf(free(), data()!.limit)}%)
                  </span>
                </text>
              )}
            </box>
          </box>
        </>
      )}
      <text fg={theme().textMuted}>esc close</text>
    </box>
  );
}
