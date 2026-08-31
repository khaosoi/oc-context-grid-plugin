/** @jsxImportSource @opentui/solid */
import { onCleanup } from "solid-js";
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui";
import { MiniGrid } from "./components/MiniGrid";
import { FullView } from "./components/FullView";

export type ContextGridOptions = {
  /** Show the sidebar mini-grid (default true). */
  sidebar?: boolean;
};

const MODE = "oc-context-grid";

const tui: TuiPlugin = async (api, options) => {
  const opts = (options ?? {}) as ContextGridOptions;

  // Where to return when the full view closes.
  let origin: { sessionID?: string } = {};

  if (opts.sidebar !== false) {
    api.slots.register({
      order: 150,
      slots: {
        sidebar_content(_ctx, props) {
          return <MiniGrid api={api} session_id={props.session_id} />;
        }
      }
    });
  }

  api.route.register([
    {
      name: "contextgrid",
      render: ({ params }) => {
        const popMode = api.mode.push(MODE);
        onCleanup(popMode);
        const sessionID =
          typeof params?.sessionID === "string" ? params.sessionID : undefined;
        return <FullView api={api} sessionID={sessionID} />;
      }
    }
  ]);

  api.keymap.registerLayer({
    commands: [
      {
        name: "contextgrid.open",
        title: "Context Grid",
        category: "Plugin",
        namespace: "palette",
        slashName: "contextgrid",
        slashAliases: ["ctx"],
        desc: "Show context usage as a grid of squares",
        run() {
          const current = api.route.current;
          const sessionID =
            current.name === "session" ? current.params?.sessionID : undefined;
          origin = typeof sessionID === "string" ? { sessionID } : {};
          api.route.navigate("contextgrid", origin);
        }
      }
    ]
  });

  api.keymap.registerLayer({
    mode: MODE,
    bindings: [
      {
        key: "escape",
        cmd: () => {
          if (origin.sessionID)
            api.route.navigate("session", { sessionID: origin.sessionID });
          else api.route.navigate("home");
        },
        desc: "Close context grid"
      }
    ]
  });
};

const plugin: TuiPluginModule & { id: string } = {
  id: "oc-context-grid",
  tui
};

export default plugin;
