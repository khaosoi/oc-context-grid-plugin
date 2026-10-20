/** @jsxImportSource @opentui/solid */
import { createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
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

  // The sidebar can mount before the host has read this session's transcript.
  // Load it once when the store is empty, then force a recompute: the read may
  // land while this component stays mounted and must not depend on the store
  // notification to show the first usage line.
  const [revision, setRevision] = createSignal(0);
  const bump = () => setRevision((value) => value + 1);

  createEffect(
    on(
      () => props.sessionID,
      (sessionID) => {
        if (context.data.session.message.list(sessionID).length > 0) return;
        void context.data.session.message
          .sync(sessionID)
          .then(bump)
          .catch(() => undefined);
      }
    )
  );

  // Re-read on session events as well: event-driven transcripts (new sessions)
  // are written by the host from the event stream, not from a message read.
  onCleanup(
    context.data.listen(({ details }) => {
      const data = (details as { data?: { sessionID?: unknown } }).data;
      if (data?.sessionID === props.sessionID) bump();
    })
  );

  const data = createMemo(() => {
    revision();
    return getContextData({
      messages: context.data.session.message.list(props.sessionID),
      session: context.data.session.get(props.sessionID),
      models: context.data.location.model.list() ?? [],
      providers: context.data.location.provider.list() ?? []
    });
  });

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
