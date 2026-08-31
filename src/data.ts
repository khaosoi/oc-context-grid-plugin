import type { AssistantMessage, Message, Part } from "@opencode-ai/sdk/v2";
import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import {
  estimateBreakdown,
  estimateTokens,
  userPartsChars,
  type BreakdownSegment,
  type EstimatorPart
} from "./breakdown";

/**
 * Extraction layer: pulls the authoritative context numbers out of the
 * reactive TUI state and derives the category breakdown.
 *
 * Mirrors OpenCode's built-in sidebar-context plugin and context tab:
 *   total  = input + output + reasoning + cache.read + cache.write
 *   limit  = provider.models[modelID].limit.context
 *   usage% = round(total / limit * 100)
 */

export type ContextData = {
  modelLabel: string;
  providerLabel: string;
  tokens: number;
  limit: number;
  percent: number | null;
  cost: number;
  segments: BreakdownSegment[];
};

const tokenTotal = (msg: AssistantMessage): number =>
  msg.tokens.input +
  msg.tokens.output +
  msg.tokens.reasoning +
  msg.tokens.cache.read +
  msg.tokens.cache.write;

export function getContextData(
  api: TuiPluginApi,
  sessionID: string
): ContextData | undefined {
  const messages = api.state.session.messages(sessionID);
  const last = messages.findLast(
    (item): item is AssistantMessage =>
      item.role === "assistant" && item.tokens.output > 0
  );
  if (!last) return undefined;

  const provider = api.state.provider.find(
    (item) => item.id === last.providerID
  );
  const model = provider?.models[last.modelID];
  const limit = model?.limit.context ?? 0;
  const tokens = tokenTotal(last);

  const userMessages = messages.filter((item) => item.role === "user");
  const systemPrompt = userMessages.findLast(
    (item) => !!(item as { system?: string }).system
  ) as { system?: string } | undefined;

  const partsOf = (messageID: string) =>
    api.state.part(messageID) as readonly EstimatorPart[] | undefined;

  // System-prompt estimate: OpenCode does not persist the assembled system
  // prompt, so use the first-request residual — everything the provider saw
  // on the first turn minus the user content that preceded it. That covers
  // the real system prompt, tool definitions, rules files and environment
  // context. An explicit per-message system prompt override wins when present.
  const systemTokens = systemPrompt?.system
    ? undefined
    : estimateSystemResidual(messages, partsOf);

  // Categories are scaled to the full used portion of the window (not just
  // non-cached input), so the used squares are fully accounted for.
  const segments = estimateBreakdown({
    messages: messages as unknown as Message[],
    parts: partsOf,
    input: tokens,
    systemPrompt: systemPrompt?.system,
    systemTokens
  });

  return {
    modelLabel: model?.name ?? last.modelID,
    providerLabel: provider?.name ?? last.providerID,
    tokens,
    limit,
    percent: limit ? Math.round((tokens / limit) * 100) : null,
    cost: api.state.session.get(sessionID)?.cost ?? 0,
    segments
  };
}

export type { Message, Part };

/**
 * First-request residual estimate of the system-side overhead.
 *
 * The first assistant message's input-side tokens (input + cache.read +
 * cache.write) cover the whole first request: system prompt, tool
 * definitions, rules files, environment context, plus the user content that
 * preceded it. Subtracting a chars/4 estimate of that user content leaves
 * the fixed system-side footprint.
 */
export function estimateSystemResidual(
  messages: readonly Message[],
  parts: (messageID: string) => readonly EstimatorPart[] | undefined
): number | undefined {
  let leadingUserChars = 0;
  for (const msg of messages) {
    if (msg.role === "user") {
      leadingUserChars += userPartsChars(parts(msg.id) ?? []);
      continue;
    }
    if (msg.role !== "assistant") continue;
    const assistant = msg as AssistantMessage;
    const firstInput =
      assistant.tokens.input +
      assistant.tokens.cache.read +
      assistant.tokens.cache.write;
    if (firstInput <= 0) return undefined;
    return Math.max(0, firstInput - estimateTokens(leadingUserChars));
  }
  return undefined;
}
