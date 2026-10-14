/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui";
import { MiniGrid } from "./components/MiniGrid";
import { FullView } from "./components/FullView";

export type ContextGridOptions = {
  /** Show the sidebar mini-grid (default true). */
  sidebar?: boolean;
};

const MODE = "oc-context-grid";

const CMD_OPEN = "oc-context-grid.open";
const CMD_CLOSE = "oc-context-grid.close";

export default Plugin.define({
  id: "oc-context-grid",
  setup(context) {
    const opts = (context.options ?? {}) as ContextGridOptions;

    // Where to return when the full view closes.
    let origin: { sessionID?: string } = {};

    // Catalog sync happens outside the reactive reads; this just makes sure
    // model/provider metadata (context limits, names) is in the store.
    void context.data.location.model.sync(context.location).catch(() => {});
    void context.data.location.provider.sync(context.location).catch(() => {});

    if (opts.sidebar !== false) {
      context.ui.slot({
        append: "sidebar.content",
        render: (props) => <MiniGrid sessionID={props.sessionID} />
      });
    }

    const unregisterRoute = context.ui.router.register({
      name: "contextgrid",
      render: ({ data }) => {
        const sessionID =
          typeof data?.sessionID === "string" ? data.sessionID : undefined;
        return <FullView sessionID={sessionID} />;
      }
    });

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: CMD_OPEN,
          title: "Context Grid",
          group: "Plugin",
          description: "Show context usage as a grid of squares",
          palette: true,
          slash: { name: "contextgrid", aliases: ["ctx"] },
          run() {
            const current = context.ui.router.current();
            const sessionID =
              current.type === "session" ? current.sessionID : undefined;
            origin = typeof sessionID === "string" ? { sessionID } : {};
            context.ui.router.navigate({
              type: "plugin",
              name: "contextgrid",
              data: { sessionID }
            });
          }
        }
      ]
    }));

    context.keymap.layer(() => ({
      mode: MODE,
      commands: [
        {
          id: CMD_CLOSE,
          bind: "escape",
          description: "Close context grid",
          run() {
            if (origin.sessionID)
              context.ui.router.navigate({
                type: "session",
                sessionID: origin.sessionID
              });
            else context.ui.router.navigate({ type: "home" });
          }
        }
      ]
    }));

    return () => unregisterRoute();
  }
});
