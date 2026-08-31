import { describe, expect, test } from "bun:test";
import {
  computeGrid,
  glyphFor,
  gridRows,
  GLYPH_FREE,
  GLYPH_FULL,
  GLYPH_PARTIAL
} from "../src/grid";
import type { BreakdownSegment } from "../src/breakdown";

const seg = (
  key: BreakdownSegment["key"],
  tokens: number
): BreakdownSegment => ({ key, tokens });

describe("computeGrid", () => {
  test("returns empty for zero limit or zero squares", () => {
    expect(
      computeGrid({
        segments: [seg("system", 10)],
        limit: 0,
        squaresTotal: 100
      })
    ).toEqual([]);
    expect(
      computeGrid({
        segments: [seg("system", 10)],
        limit: 100,
        squaresTotal: 0
      })
    ).toEqual([]);
  });

  test("empty session renders all free squares", () => {
    const squares = computeGrid({ segments: [], limit: 100, squaresTotal: 10 });
    expect(squares).toHaveLength(10);
    expect(squares.every((s) => s.key === "free")).toBe(true);
    expect(squares.every((s) => glyphFor(s) === GLYPH_FREE)).toBe(true);
  });

  test("single category fills whole squares as full glyphs", () => {
    // limit 100, 10 squares -> 10 tokens per square; 30 tokens -> 3 full squares
    const squares = computeGrid({
      segments: [seg("system", 30)],
      limit: 100,
      squaresTotal: 10
    });
    expect(
      squares.slice(0, 3).every((s) => s.key === "system" && s.fullness === 1)
    ).toBe(true);
    expect(squares.slice(3).every((s) => s.key === "free")).toBe(true);
  });

  test("partial square uses dominant category and partial glyph below 0.7", () => {
    // 6 tokens in a 10-token square -> fullness 0.6 -> partial glyph
    const squares = computeGrid({
      segments: [seg("tool", 6)],
      limit: 100,
      squaresTotal: 10
    });
    expect(squares[0]).toEqual({ key: "tool", fullness: 0.6 });
    expect(glyphFor(squares[0])).toBe(GLYPH_PARTIAL);
  });

  test("fullness >= 0.7 renders full glyph", () => {
    const squares = computeGrid({
      segments: [seg("tool", 7)],
      limit: 100,
      squaresTotal: 10
    });
    expect(squares[0].fullness).toBeCloseTo(0.7);
    expect(glyphFor(squares[0])).toBe(GLYPH_FULL);
  });

  test("category boundary: dominant category wins a straddling square", () => {
    // squareTokens = 10. Square 0: system covers 8 -> dominant system, fullness 0.8
    // (user spills 2 into it). Square 1: user has 6 left -> dominant user, fullness 0.6.
    const squares = computeGrid({
      segments: [seg("system", 8), seg("user", 8)],
      limit: 100,
      squaresTotal: 10
    });
    expect(squares[0].key).toBe("system");
    expect(squares[0].fullness).toBeCloseTo(0.8);
    expect(squares[1].key).toBe("user");
    expect(squares[1].fullness).toBeCloseTo(0.6);
    expect(squares[2].key).toBe("free");
  });

  test("overflow clamps to a fully-used grid", () => {
    const squares = computeGrid({
      segments: [seg("assistant", 200)],
      limit: 100,
      squaresTotal: 10
    });
    expect(
      squares.every((s) => s.key === "assistant" && s.fullness === 1)
    ).toBe(true);
  });

  test("free space count matches remainder", () => {
    // used 25 of 100 with 10 squares (10 tokens each): squares 0-1 full, square 2 partial (5/10), rest free
    const squares = computeGrid({
      segments: [seg("user", 25)],
      limit: 100,
      squaresTotal: 10
    });
    expect(squares.filter((s) => s.key === "free")).toHaveLength(7);
  });

  test("skips zero-token and free segments in pools", () => {
    const squares = computeGrid({
      segments: [seg("system", 0), seg("free", 50), seg("tool", 10)],
      limit: 100,
      squaresTotal: 10
    });
    expect(squares[0].key).toBe("tool");
    expect(squares.slice(1).every((s) => s.key === "free")).toBe(true);
  });
});

describe("gridRows", () => {
  test("groups into columns", () => {
    const squares = computeGrid({
      segments: [seg("system", 10)],
      limit: 100,
      squaresTotal: 10
    });
    const rows = gridRows(squares, 4);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveLength(4);
    expect(rows[2]).toHaveLength(2);
  });
});
