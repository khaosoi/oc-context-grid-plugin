/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test";
import type { SessionMessageInfo } from "@opencode/client";
import { createData } from "@opencode/client/solid";
import { PluginContextProvider, type Plugin } from "@opencode/plugin/tui";
import { testRender } from "@opentui/solid";
import { MiniGrid } from "../src/components/MiniGrid";

const messages = [
  {
    id: "msg_user",
    type: "user",
    text: "hello",
    time: { created: 1 }
  },
  {
    id: "msg_assistant",
    type: "assistant",
    model: { providerID: "test", id: "test-model" },
    content: [],
    tokens: {
      input: 1000,
      output: 50,
      reasoning: 0,
      cache: { read: 0, write: 0 }
    },
    time: { created: 2 }
  }
] as unknown as SessionMessageInfo[];

function Harness() {
  const data = createData({
    api: () =>
      ({
        message: {
          list: async () => ({
            data: messages,
            cursor: { next: undefined }
          })
        }
      }) as never,
    directory: "/tmp",
    event: { on: () => () => {}, listen: () => () => {} },
    connection: { status: () => "connected" }
  });
  const context = {
    data,
    theme: { text: { base: "white", muted: "gray" } }
  } as unknown as Plugin.Context;
  return (
    <PluginContextProvider value={context}>
      <MiniGrid sessionID="ses_test" />
    </PluginContextProvider>
  );
}

test("loads usage when the sidebar mounts before the transcript", async () => {
  const app = await testRender(() => <Harness />, { width: 40, height: 5 });
  const frame = await app.waitForFrame((value) => value.includes("tokens"));
  expect(frame).not.toContain("no usage yet");
  expect(frame).toContain("1.1k/0 tokens");
  await app.dispose();
});
