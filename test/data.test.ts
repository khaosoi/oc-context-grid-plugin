import { describe, expect, test } from "bun:test";
import { estimateSystemResidual } from "../src/data";
import type { EstimatorMessage } from "../src/breakdown";

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
