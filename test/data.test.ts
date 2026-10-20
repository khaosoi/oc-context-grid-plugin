import { describe, expect, test } from "bun:test";
import { estimateSystemResidual, lastAssistantWithUsage } from "../src/data";
import type { EstimatorMessage } from "../src/breakdown";
import type { SessionMessageInfo } from "@opencode/client";

const user = (id: string, text?: string): EstimatorMessage => ({
  id,
  type: "user",
  text
});

const assistant = (
  id: string,
  tokens: { input: number; read?: number; write?: number }
): EstimatorMessage => ({
  id,
  type: "assistant",
  tokens: {
    input: tokens.input,
    output: 1,
    reasoning: 0,
    cache: { read: tokens.read ?? 0, write: tokens.write ?? 0 }
  }
});

describe("estimateSystemResidual", () => {
  test("first request input minus leading user text", () => {
    const messages = [user("u1", "x".repeat(400)), assistant("a1", { input: 2000 })];
    // 2000 - 400/4 = 1900
    expect(estimateSystemResidual(messages)).toBe(1900);
  });

  test("includes cache read/write in the first request input", () => {
    const messages = [
      user("u1", "x".repeat(400)),
      assistant("a1", { input: 500, read: 1000, write: 600 })
    ];
    // 2100 - 100 = 2000
    expect(estimateSystemResidual(messages)).toBe(2000);
  });

  test("accumulates multiple leading user messages", () => {
    const messages = [
      user("u1", "x".repeat(200)),
      user("u2", "y".repeat(200)),
      assistant("a1", { input: 2000 })
    ];
    // 2000 - (200+200)/4 = 1900
    expect(estimateSystemResidual(messages)).toBe(1900);
  });

  test("clamps at zero when user content exceeds input", () => {
    const messages = [user("u1", "x".repeat(4000)), assistant("a1", { input: 50 })];
    expect(estimateSystemResidual(messages)).toBe(0);
  });

  test("returns undefined when there is no assistant message", () => {
    expect(estimateSystemResidual([user("u1", "x".repeat(400))])).toBeUndefined();
  });
});

type Usage = {
  input: number;
  output?: number;
  reasoning?: number;
  read?: number;
  write?: number;
};

const assistantMessage = (
  id: string,
  usage: Usage = { input: 1000 }
): SessionMessageInfo =>
  ({
    id,
    type: "assistant",
    content: [],
    time: { created: 1 },
    tokens: {
      input: usage.input,
      output: usage.output ?? 1,
      reasoning: usage.reasoning ?? 0,
      cache: { read: usage.read ?? 0, write: usage.write ?? 0 }
    }
  }) as unknown as SessionMessageInfo;

const streamingMessage = (id: string): SessionMessageInfo =>
  ({
    id,
    type: "assistant",
    content: [],
    time: { created: 1 }
  }) as unknown as SessionMessageInfo;

const compaction = (
  id: string,
  status: "running" | "completed"
): SessionMessageInfo =>
  ({
    id,
    type: "compaction",
    status,
    reason: "auto",
    summary: "",
    recent: ""
  }) as unknown as SessionMessageInfo;

const userMessage = (id: string): SessionMessageInfo =>
  ({ id, type: "user", text: "", time: { created: 0 } }) as unknown as SessionMessageInfo;

describe("lastAssistantWithUsage", () => {
  test("picks the latest assistant that carries usage", () => {
    const first = assistantMessage("a1");
    const latest = assistantMessage("a2");
    expect(
      lastAssistantWithUsage([userMessage("u1"), first, latest])?.id
    ).toBe("a2");
  });

  test("skips assistant steps without usage", () => {
    const complete = assistantMessage("a1");
    const streaming = streamingMessage("a2");
    expect(lastAssistantWithUsage([complete, streaming])?.id).toBe("a1");
  });

  test("ignores steps before the last completed compaction", () => {
    const before = assistantMessage("a1");
    expect(
      lastAssistantWithUsage([before, compaction("c1", "completed")])
    ).toBeUndefined();

    const after = assistantMessage("a2");
    expect(
      lastAssistantWithUsage([before, compaction("c1", "completed"), after])?.id
    ).toBe("a2");
  });

  test("does not reset on a running compaction", () => {
    const usage = assistantMessage("a1");
    expect(
      lastAssistantWithUsage([usage, compaction("c1", "running")])?.id
    ).toBe("a1");
  });

  test("stops at the revert boundary", () => {
    const kept = assistantMessage("a1");
    const reverted = assistantMessage("a2");
    expect(lastAssistantWithUsage([kept, reverted], "a2")?.id).toBe("a1");
  });

  test("returns undefined when the revert boundary is missing", () => {
    expect(
      lastAssistantWithUsage([assistantMessage("a1")], "missing")
    ).toBeUndefined();
  });
});
