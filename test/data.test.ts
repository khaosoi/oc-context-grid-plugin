import { describe, expect, test } from "bun:test";
import { estimateSystemResidual } from "../src/data";
import type { Message } from "@opencode-ai/sdk/v2";

const user = (id: string) =>
  ({
    id,
    role: "user",
    sessionID: "s",
    time: { created: 0 }
  }) as unknown as Message;

const assistant = (
  id: string,
  tokens: { input: number; read?: number; write?: number }
) =>
  ({
    id,
    role: "assistant",
    sessionID: "s",
    time: { created: 0 },
    tokens: {
      input: tokens.input,
      output: 1,
      reasoning: 0,
      cache: { read: tokens.read ?? 0, write: tokens.write ?? 0 }
    }
  }) as unknown as Message;

const textPart = (text: string) => ({ type: "text", text }) as never;

describe("estimateSystemResidual", () => {
  test("first request input minus leading user chars", () => {
    const messages = [user("u1"), assistant("a1", { input: 2000 })];
    const parts = (id: string) =>
      id === "u1" ? [textPart("x".repeat(400))] : [];
    // 2000 - 400/4 = 1900
    expect(estimateSystemResidual(messages, parts)).toBe(1900);
  });

  test("includes cache read/write in the first request input", () => {
    const messages = [
      user("u1"),
      assistant("a1", { input: 500, read: 1000, write: 600 })
    ];
    const parts = (id: string) =>
      id === "u1" ? [textPart("x".repeat(400))] : [];
    // 2100 - 100 = 2000
    expect(estimateSystemResidual(messages, parts)).toBe(2000);
  });

  test("accumulates multiple leading user messages", () => {
    const messages = [user("u1"), user("u2"), assistant("a1", { input: 2000 })];
    const parts = (id: string) =>
      id === "u1"
        ? [textPart("x".repeat(200))]
        : id === "u2"
          ? [textPart("y".repeat(200))]
          : [];
    // 2000 - (200+200)/4 = 1900
    expect(estimateSystemResidual(messages, parts)).toBe(1900);
  });

  test("clamps at zero when user content exceeds input", () => {
    const messages = [user("u1"), assistant("a1", { input: 50 })];
    const parts = (id: string) =>
      id === "u1" ? [textPart("x".repeat(4000))] : [];
    expect(estimateSystemResidual(messages, parts)).toBe(0);
  });

  test("returns undefined when there is no assistant message", () => {
    expect(estimateSystemResidual([user("u1")], () => [])).toBeUndefined();
  });
});
