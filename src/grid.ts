import type { BreakdownKey, BreakdownSegment } from "./breakdown";

/**
 * Pure grid computation: turns a category breakdown + context limit into
 * rows of little squares, Claude Code `/context`-style.
 *
 * Each square covers `limit / squaresTotal` tokens. Squares are filled
 * left-to-right, top-to-bottom in breakdown order; the remainder is free
 * space. A square straddling category boundaries takes the dominant
 * (largest-overlap) category and a fullness ratio.
 */

export type SquareKey = BreakdownKey;

export type Square = {
  key: SquareKey;
  /** 0..1 — how much of this square the dominant category covers. */
  fullness: number;
};

export const GLYPH_FULL = "⛁";
export const GLYPH_PARTIAL = "⛀";
export const GLYPH_FREE = "⛶";

/** Claude Code's rule: >= 0.7 coverage renders as a full square. */
export const FULLNESS_THRESHOLD = 0.7;

export function glyphFor(square: Square): string {
  if (square.key === "free") return GLYPH_FREE;
  return square.fullness >= FULLNESS_THRESHOLD ? GLYPH_FULL : GLYPH_PARTIAL;
}

export function computeGrid(args: {
  segments: BreakdownSegment[];
  limit: number;
  squaresTotal: number;
}): Square[] {
  const { segments, limit, squaresTotal } = args;
  if (!limit || limit <= 0 || squaresTotal <= 0) return [];

  const squareTokens = limit / squaresTotal;
  const used = segments.reduce((sum, segment) => sum + segment.tokens, 0);
  const clampedUsed = Math.min(used, limit);

  const squares: Square[] = [];
  // Mutable copy of token pools per category, consumed as we walk squares.
  const pools = segments
    .filter((segment) => segment.key !== "free" && segment.tokens > 0)
    .map((segment) => ({ key: segment.key, remaining: segment.tokens }));

  let squareStart = 0;
  for (let i = 0; i < squaresTotal; i++) {
    const squareEnd = squareStart + squareTokens;
    if (squareStart >= clampedUsed) {
      squares.push({ key: "free", fullness: 0 });
      squareStart = squareEnd;
      continue;
    }

    // Dominant category = the one with most tokens overlapping this square.
    let dominant: SquareKey = "free";
    let dominantOverlap = 0;
    let covered = 0;
    for (const pool of pools) {
      if (covered >= squareTokens) break;
      if (pool.remaining <= 0) continue;
      const overlap = Math.min(pool.remaining, squareTokens - covered);
      pool.remaining -= overlap;
      covered += overlap;
      if (overlap > dominantOverlap) {
        dominantOverlap = overlap;
        dominant = pool.key;
      }
    }

    if (dominant === "free") {
      squares.push({ key: "free", fullness: 0 });
    } else {
      squares.push({ key: dominant, fullness: dominantOverlap / squareTokens });
    }
    squareStart = squareEnd;
  }

  return squares;
}

/** Group squares into rows of `columns`. */
export function gridRows(squares: Square[], columns: number): Square[][] {
  if (columns <= 0) return [squares];
  const rows: Square[][] = [];
  for (let i = 0; i < squares.length; i += columns) {
    rows.push(squares.slice(i, i + columns));
  }
  return rows;
}
