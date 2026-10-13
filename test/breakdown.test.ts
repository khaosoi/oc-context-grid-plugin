import { describe, expect, test } from "bun:test";
import {
  estimateBreakdown,
  estimateTokens,
  type EstimatorMessage,
  type EstimatorPart,
  type EstimatorToolState
} from "../src/breakdown";

const userMsg = (id: string, text?: string): EstimatorMessage => ({
  id,
  type: "user",
  text
});
const assistantMsg = (id: string): EstimatorMessage => ({
  id,
  type: "assistant"
});
const assistantWithTokens = (
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

const text = (t: string): EstimatorPart => ({ type: "text", text: t });
const toolState = (state: EstimatorToolState): EstimatorPart => ({
  type: "tool",
  state
});
const toolCompleted = (
  input: Record<string, unknown>,
  output: string
): EstimatorPart => toolState({
  status: "completed",
  input,
  content: [{ type: "text", text: output }]
});

describe("estimateTokens", () => {
  test("chars/4 rounded up", () => {
    expect(estimateTokens(0)).toBe(0);
    expect(estimateTokens(1)).toBe(1);
    expect(estimateTokens(400)).toBe(100);
  });
});

describe("estimateBreakdown", () => {
  test("returns empty when input is zero", () => {
    expect(estimateBreakdown({ messages: [], input: 0 })).toEqual([]);
  });

  test("categories sum to input with 'other' as remainder", () => {
    const segments = estimateBreakdown({
      messages: [userMsg("u1", "x".repeat(400)), { ...assistantMsg("a1"), content: [text("y".repeat(800))] }],
      input: 1000
    });
    const byKey = Object.fromEntries(segments.map((s) => [s.key, s.tokens]));
    expect(byKey.user).toBe(100);
    expect(byKey.assistant).toBe(200);
    expect(byKey.other).toBe(700);
    expect(segments.reduce((sum, s) => sum + s.tokens, 0)).toBe(1000);
  });

  test("systemTokens counts toward system", () => {
    const segments = estimateBreakdown({
      messages: [],
      input: 500,
      systemTokens: 100
    });
    const byKey = Object.fromEntries(segments.map((s) => [s.key, s.tokens]));
    expect(byKey.system).toBe(100);
    expect(byKey.other).toBe(400);
  });

  test("tool parts count input keys * 16 plus output", () => {
    const messages = [
      { ...assistantMsg("a1"), content: [toolCompleted({ filePath: "x", content: "y" }, "o".repeat(400))] }
    ];
    const segments = estimateBreakdown({ messages, input: 1000 });
    const tool = segments.find((s) => s.key === "tool");
    // 2 keys * 16 + 400 chars = 432 chars -> 108 tokens
    expect(tool?.tokens).toBe(estimateTokens(432));
  });

  test("streaming tool state counts only its raw input", () => {
    const messages = [
      { ...assistantMsg("a1"), content: [toolState({ status: "streaming", input: "r".repeat(200) })] }
    ];
    const segments = estimateBreakdown({ messages, input: 500 });
    expect(segments.find((s) => s.key === "tool")?.tokens).toBe(50);
  });

  test("scale-down branch keeps sum at input when over-estimated", () => {
    const messages = [
      userMsg("u1", "x".repeat(4000)),
      { ...assistantMsg("a1"), content: [text("y".repeat(4000))] }
    ];
    const segments = estimateBreakdown({ messages, input: 1000 });
    const sum = segments.reduce((acc, s) => acc + s.tokens, 0);
    expect(sum).toBeLessThanOrEqual(1000);
    // scaled: 500 + 500 = 1000 -> other = 0 and dropped
    expect(segments.find((s) => s.key === "other")).toBeUndefined();
    expect(segments.find((s) => s.key === "user")?.tokens).toBe(500);
  });

  test("zero-token categories are dropped", () => {
    const messages = [userMsg("u1", "hi")];
    const segments = estimateBreakdown({ messages, input: 100 });
    expect(segments.every((s) => s.tokens > 0)).toBe(true);
    expect(segments.find((s) => s.key === "system")).toBeUndefined();
  });

  test("assistant reasoning text counts as assistant", () => {
    const messages = [
      { ...assistantMsg("a1"), content: [{ type: "reasoning", text: "r".repeat(400) }] }
    ];
    const segments = estimateBreakdown({ messages, input: 500 });
    expect(segments.find((s) => s.key === "assistant")?.tokens).toBe(100);
  });
});
