/**
 * Category breakdown estimation, adapted for OpenCode V2's message model
 * (messages carry their content inline instead of separate part records).
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
export interface EstimatorToolState {
  status?: string;
  /** "streaming" carries the partial JSON string; others carry the parsed args. */
  input?: string | Record<string, unknown>;
  /** "completed" tool result content (text items count as tool output). */
  content?: readonly { type: string; text?: string }[];
  error?: unknown;
}

export interface EstimatorPart {
  type: string;
  text?: string;
  state?: EstimatorToolState;
}

export interface EstimatorMessage {
  id: string;
  /** V2 message type: "user", "assistant", ... */
  type: string;
  /** User prompt text. */
  text?: string;
  /** Assistant content parts. */
  content?: readonly EstimatorPart[];
  /** Assistant provider-reported token usage (used for the system residual). */
  tokens?: {
    input: number;
    output: number;
    reasoning: number;
    cache: { read: number; write: number };
  };
}

export const estimateTokens = (chars: number): number => Math.ceil(chars / 4);

/** Total chars of user-visible prompt text. */
export const userMessageChars = (messages: readonly EstimatorMessage[]): number =>
  messages.reduce(
    (sum, msg) => (msg.type === "user" ? sum + (msg.text?.length ?? 0) : sum),
    0
  );

const inputChars = (state: EstimatorToolState): number => {
  const input = state.input;
  if (typeof input === "string") return input.length;
  return Object.keys(input ?? {}).length * 16;
};

const errorChars = (error: unknown): number => {
  if (typeof error === "string") return error.length;
  try {
    return JSON.stringify(error)?.length ?? 0;
  } catch {
    return 0;
  }
};

const charsFromAssistantPart = (
  part: EstimatorPart
): { assistant: number; tool: number } => {
  if (part.type === "text" || part.type === "reasoning") {
    return { assistant: part.text?.length ?? 0, tool: 0 };
  }
  if (part.type !== "tool") return { assistant: 0, tool: 0 };

  const state = part.state ?? {};
  const input = inputChars(state);
  const output = (state.content ?? []).reduce(
    (sum, content) => sum + (content.type === "text" ? content.text?.length ?? 0 : 0),
    0
  );
  switch (state.status) {
    case "streaming":
    case "running":
      return { assistant: 0, tool: input };
    case "completed":
      return { assistant: 0, tool: input + output };
    case "error":
      return { assistant: 0, tool: input + errorChars(state.error) };
    default:
      return { assistant: 0, tool: input };
  }
};

export function estimateBreakdown(args: {
  messages: EstimatorMessage[];
  /** Authoritative provider-reported context input tokens (the number categories must sum to). */
  input: number;
  /**
   * Pre-computed system token estimate (e.g. first-request residual:
   * everything the provider saw before the first user message — system
   * prompt, tool definitions, rules files, environment context).
   */
  systemTokens?: number;
}): BreakdownSegment[] {
  if (!args.input) return [];

  const counts = {
    user: 0,
    assistant: 0,
    tool: 0
  };
  for (const msg of args.messages) {
    if (msg.type === "user") {
      counts.user += msg.text?.length ?? 0;
      continue;
    }
    if (msg.type !== "assistant") continue;
    for (const part of msg.content ?? []) {
      const next = charsFromAssistantPart(part);
      counts.assistant += next.assistant;
      counts.tool += next.tool;
    }
  }

  const tokens = {
    system: args.systemTokens ?? 0,
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
