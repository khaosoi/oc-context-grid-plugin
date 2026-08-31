/** @jsxImportSource @opentui/solid */
import { createMemo } from "solid-js";
import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import { getContextData } from "../data";
import { computeGrid } from "../grid";
import { formatTokens } from "../format";
import { Grid } from "./Grid";

const COLUMNS = 10;
const SQUARES = 30; // 10 x 3

export function MiniGrid(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current;
  const data = createMemo(() => getContextData(props.api, props.session_id));

  const squares = createMemo(() => {
    const ctx = data();
    if (!ctx?.limit) return [];
    return computeGrid({
      segments: ctx.segments,
      limit: ctx.limit,
      squaresTotal: SQUARES
    });
  });

  return (
    <box>
      <text fg={theme().text}>
        <b>Context grid</b>
      </text>
      {data() === undefined ? (
        <text fg={theme().textMuted}>no usage yet</text>
      ) : (
        <>
          <text fg={theme().textMuted}>
            {formatTokens(data()!.tokens)}/{formatTokens(data()!.limit)} tokens
            ({data()!.percent ?? 0}%)
          </text>
          <Grid squares={squares()} columns={COLUMNS} theme={theme} />
        </>
      )}
    </box>
  );
}
