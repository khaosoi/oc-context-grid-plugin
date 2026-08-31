import { describe, expect, test } from "bun:test";
import {
  estimateBreakdown,
  estimateTokens,
  type EstimatorMessage,
  type EstimatorPart
} from "../src/breakdown";

const userMsg = (id: string, system?: string): EstimatorMessage => ({
  id,
  role: "user",
  system
});
const assistantMsg = (id: string): EstimatorMessage => ({
  id,
  role: "assistant"
});

const text = (t: string): EstimatorPart => ({ type: "text", text: t });
const toolCompleted = (
  input: Record<string, unknown>,
  output: string
): EstimatorPart => ({
  type: "tool",
  state: { status: "completed", input, output }
});

const partsOf = (map: Record<string, EstimatorPart[]>) => (id: string) =>
  map[id];

describe("estimateTokens", () => {
  test("chars/4 rounded up", () => {
    expect(estimateTokens(0)).toBe(0);
    expect(estimateTokens(1)).toBe(1);
    expect(estimateTokens(400)).toBe(100);
  });
});

describe("estimateBreakdown", () => {
  test("returns empty when input is zero", () => {
    expect(
      estimateBreakdown({ messages: [], parts: () => [], input: 0 })
    ).toEqual([]);
  });

  test("categories sum to input with 'other' as remainder", () => {
    const messages = [userMsg("u1"), assistantMsg("a1")];
    const parts = partsOf({
      u1: [text("x".repeat(400))], // 100 tokens
      a1: [text("y".repeat(800))] // 200 tokens
    });
    const segments = estimateBreakdown({ messages, parts, input: 1000 });
    const byKey = Object.fromEntries(segments.map((s) => [s.key, s.tokens]));
    expect(byKey.user).toBe(100);
    expect(byKey.assistant).toBe(200);
    expect(byKey.other).toBe(700);
    expect(segments.reduce((sum, s) => sum + s.tokens, 0)).toBe(1000);
  });

  test("system prompt counts toward system", () => {
    const segments = estimateBreakdown({
      messages: [],
      parts: () => [],
      input: 500,
      systemPrompt: "z".repeat(400) // 100 tokens
    });
    const byKey = Object.fromEntries(segments.map((s) => [s.key, s.tokens]));
    expect(byKey.system).toBe(100);
    expect(byKey.other).toBe(400);
  });

  test("tool parts count input keys * 16 plus output", () => {
    const messages = [assistantMsg("a1")];
    const parts = partsOf({
      a1: [toolCompleted({ filePath: "x", content: "y" }, "o".repeat(400))]
    });
    const segments = estimateBreakdown({ messages, parts, input: 1000 });
    const tool = segments.find((s) => s.key === "tool");
    // 2 keys * 16 + 400 chars = 432 chars -> 108 tokens
    expect(tool?.tokens).toBe(estimateTokens(432));
  });

  test("scale-down branch keeps sum at input when over-estimated", () => {
    const messages = [userMsg("u1"), assistantMsg("a1")];
    const parts = partsOf({
      u1: [text("x".repeat(4000))], // 1000 tokens estimated
      a1: [text("y".repeat(4000))] // 1000 tokens estimated
    });
    const segments = estimateBreakdown({ messages, parts, input: 1000 });
    const sum = segments.reduce((acc, s) => acc + s.tokens, 0);
    expect(sum).toBeLessThanOrEqual(1000);
    // scaled: 500 + 500 = 1000 -> other = 0 and dropped
    expect(segments.find((s) => s.key === "other")).toBeUndefined();
    expect(segments.find((s) => s.key === "user")?.tokens).toBe(500);
  });

  test("zero-token categories are dropped", () => {
    const messages = [userMsg("u1")];
    const parts = partsOf({ u1: [text("hi")] });
    const segments = estimateBreakdown({ messages, parts, input: 100 });
    expect(segments.every((s) => s.tokens > 0)).toBe(true);
    expect(segments.find((s) => s.key === "system")).toBeUndefined();
  });

  test("assistant reasoning text counts as assistant", () => {
    const messages = [assistantMsg("a1")];
    const parts = partsOf({
      a1: [{ type: "reasoning", text: "r".repeat(400) }]
    });
    const segments = estimateBreakdown({ messages, parts, input: 500 });
    expect(segments.find((s) => s.key === "assistant")?.tokens).toBe(100);
  });

  test("systemTokens override wins over systemPrompt chars", () => {
    const segments = estimateBreakdown({
      messages: [],
      parts: () => [],
      input: 1000,
      systemPrompt: "z".repeat(400), // would be 100 tokens
      systemTokens: 300
    });
    const byKey = Object.fromEntries(segments.map((s) => [s.key, s.tokens]));
    expect(byKey.system).toBe(300);
    expect(byKey.other).toBe(700);
  });
});
