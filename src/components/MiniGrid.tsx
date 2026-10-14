/** @jsxImportSource @opentui/solid */
import { createMemo } from "solid-js";
import { usePlugin } from "@opencode/plugin/tui";
import { getContextData } from "../data";
import { computeGrid } from "../grid";
import { formatTokens } from "../format";
import { Grid } from "./Grid";

const COLUMNS = 10;
const SQUARES = 30; // 10 x 3

export function MiniGrid(props: { sessionID: string }) {
  const context = usePlugin();
  const theme = () => context.theme;

  const data = createMemo(() =>
    getContextData({
      messages: context.data.session.message.list(props.sessionID),
      session: context.data.session.get(props.sessionID),
      models: context.data.location.model.list() ?? [],
      providers: context.data.location.provider.list() ?? []
    })
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

  return (
    <box>
      <text fg={theme().text.base}>
        <b>Context grid</b>
      </text>
      {data() === undefined ? (
        <text fg={theme().text.muted}>no usage yet</text>
      ) : (
        <>
          <text fg={theme().text.muted}>
            {formatTokens(data()!.tokens)}/{formatTokens(data()!.limit)} tokens
            ({data()!.percent ?? 0}%)
          </text>
          <Grid squares={squares()} columns={COLUMNS} theme={theme} />
        </>
      )}
    </box>
  );
}
