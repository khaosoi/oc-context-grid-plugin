/**
 * Category breakdown estimation, ported from OpenCode's own context tab
 * (packages/app/src/components/session/session-context-breakdown.ts).
 *
 * No tokenizers: everything is a chars/4 heuristic, scaled to the
 * provider-reported input token count so categories always sum to the
 * authoritative number.
 */

export type BreakdownKey =
  "system" | "user" | "assistant" | "tool" | "other" | "free";

export type BreakdownSegment = {
  key: BreakdownKey;
  tokens: number;
};

/** Minimal structural shapes so the estimator stays free of SDK imports. */
export interface EstimatorPart {
  type: string;
  text?: string;
  source?: { text?: { value?: string }; value?: string };
  state?: {
    status?: string;
    input?: Record<string, unknown>;
    raw?: string;
    output?: string;
    error?: string;
  };
}

export interface EstimatorMessage {
  id: string;
  role: string;
  system?: string;
}

export const estimateTokens = (chars: number): number => Math.ceil(chars / 4);

const charsFromUserPart = (part: EstimatorPart): number => {
  if (part.type === "text") return part.text?.length ?? 0;
  if (part.type === "file") return part.source?.text?.value?.length ?? 0;
  if (part.type === "agent") return part.source?.value?.length ?? 0;
  return 0;
};

/** Total chars of user-visible content in a set of parts. */
export const userPartsChars = (parts: readonly EstimatorPart[]): number =>
  parts.reduce((sum, part) => sum + charsFromUserPart(part), 0);

const charsFromAssistantPart = (
  part: EstimatorPart
): { assistant: number; tool: number } => {
  if (part.type === "text" || part.type === "reasoning") {
    return { assistant: part.text?.length ?? 0, tool: 0 };
  }
  if (part.type !== "tool") return { assistant: 0, tool: 0 };

  const state = part.state ?? {};
  const input = Object.keys(state.input ?? {}).length * 16;
  if (state.status === "pending")
    return { assistant: 0, tool: input + (state.raw?.length ?? 0) };
  if (state.status === "completed")
    return { assistant: 0, tool: input + (state.output?.length ?? 0) };
  if (state.status === "error")
    return { assistant: 0, tool: input + (state.error?.length ?? 0) };
  return { assistant: 0, tool: input };
};

export function estimateBreakdown(args: {
  messages: EstimatorMessage[];
  parts: (messageID: string) => readonly EstimatorPart[] | undefined;
  /** Authoritative provider-reported context input tokens (the number categories must sum to). */
  input: number;
  systemPrompt?: string;
  /**
   * Pre-computed system token estimate (e.g. first-request residual:
   * everything the provider saw before the first user message — system
   * prompt, tool definitions, rules files, environment context).
   * Wins over `systemPrompt` when set.
   */
  systemTokens?: number;
}): BreakdownSegment[] {
  if (!args.input) return [];

  const counts = {
    system: args.systemPrompt?.length ?? 0,
    user: 0,
    assistant: 0,
    tool: 0
  };
  for (const msg of args.messages) {
    const parts = args.parts(msg.id) ?? [];
    if (msg.role === "user") {
      for (const part of parts) counts.user += charsFromUserPart(part);
      continue;
    }
    if (msg.role !== "assistant") continue;
    for (const part of parts) {
      const next = charsFromAssistantPart(part);
      counts.assistant += next.assistant;
      counts.tool += next.tool;
    }
  }

  const tokens = {
    system: args.systemTokens ?? estimateTokens(counts.system),
    user: estimateTokens(counts.user),
    assistant: estimateTokens(counts.assistant),
    tool: estimateTokens(counts.tool)
  };
  const estimated =
    tokens.system + tokens.user + tokens.assistant + tokens.tool;

  if (estimated <= args.input) {
    return build(tokens, args.input - estimated, args.input);
  }

  const scale = args.input / estimated;
  const scaled = {
    system: Math.floor(tokens.system * scale),
    user: Math.floor(tokens.user * scale),
    assistant: Math.floor(tokens.assistant * scale),
    tool: Math.floor(tokens.tool * scale)
  };
  const total = scaled.system + scaled.user + scaled.assistant + scaled.tool;
  return build(scaled, Math.max(0, args.input - total), args.input);
}

function build(
  tokens: { system: number; user: number; assistant: number; tool: number },
  other: number,
  input: number
): BreakdownSegment[] {
  const segments: BreakdownSegment[] = [
    { key: "system", tokens: tokens.system },
    { key: "user", tokens: tokens.user },
    { key: "assistant", tokens: tokens.assistant },
    { key: "tool", tokens: tokens.tool },
    { key: "other", tokens: other }
  ];
  return segments.filter((segment) => segment.tokens > 0 && input > 0);
}
