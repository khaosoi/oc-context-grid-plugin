/** Format a token count Claude Code-style: 834 -> "834", 48123 -> "48k", 1234567 -> "1.2M" */
export function formatTokens(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens < 0) return "0";
  if (tokens >= 1_000_000) return `${trim1(tokens / 1_000_000)}M`;
  if (tokens >= 1_000) return `${trim1(tokens / 1_000)}k`;
  return `${Math.round(tokens)}`;
}

function trim1(value: number): string {
  const rounded =
    value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded}`;
}

/** Format a percentage integer-ish: 24 */
export function formatPercent(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

export function formatCost(usd: number): string {
  return money.format(usd);
}
