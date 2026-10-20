import type {
  ModelInfo,
  ProviderInfo,
  SessionInfo,
  SessionMessageInfo
} from "@opencode/client";
import {
  estimateBreakdown,
  estimateTokens,
  userMessageChars,
  type BreakdownSegment,
  type EstimatorMessage,
  type EstimatorPart
} from "./breakdown";

/**
 * Extraction layer: pulls the authoritative context numbers out of the
 * reactive V2 plugin data layer and derives the category breakdown.
 *
 * Mirrors OpenCode's built-in sidebar-context plugin and context tab:
 *   total  = input + output + reasoning + cache.read + cache.write
 *   limit  = model.limit.context
 *   usage% = round(total / limit * 100)
 *
 * All inputs are plain reads from the reactive data store, so callers wrap
 * them in a `createMemo` and Solid tracks the underlying store.
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

export type ContextSnapshot = {
  messages: readonly SessionMessageInfo[];
  session: SessionInfo | undefined;
  models: readonly ModelInfo[];
  providers: readonly ProviderInfo[];
};

export type { EstimatorMessage, EstimatorPart };

const tokenTotal = (tokens: {
  input: number;
  output: number;
  reasoning: number;
  cache: { read: number; write: number };
}): number =>
  tokens.input +
  tokens.output +
  tokens.reasoning +
  tokens.cache.read +
  tokens.cache.write;

/** Map a V2 SDK message to the estimator's structural shape. */
const toEstimator = (msg: SessionMessageInfo): EstimatorMessage => {
  if (msg.type === "user") {
    return { id: msg.id, type: "user", text: msg.text };
  }
  if (msg.type !== "assistant") {
    return { id: msg.id, type: msg.type };
  }
  return { id: msg.id, type: "assistant", content: msg.content, tokens: msg.tokens };
};

type AssistantWithUsage = Extract<
  SessionMessageInfo,
  { type: "assistant" }
> & {
  tokens: NonNullable<
    Extract<SessionMessageInfo, { type: "assistant" }>["tokens"]
  >;
};

/**
 * The assistant step whose tokens fill the context window now.
 *
 * Mirrors `lastAssistantWithUsage` from `@opencode/client/solid` (OpenCode
 * 2.1): the latest assistant with usage after the last completed compaction
 * and before the revert boundary. Kept local so the plugin still runs against
 * 2.0.x hosts, which do not export the helper.
 */
export function lastAssistantWithUsage(
  messages: readonly SessionMessageInfo[],
  boundary?: string
): AssistantWithUsage | undefined {
  const boundaryIndex = boundary
    ? messages.findIndex((message) => message.id === boundary)
    : -1;
  if (boundary && boundaryIndex === -1) return undefined;
  const end = boundaryIndex === -1 ? messages.length : boundaryIndex;
  const compactionIndex = messages.findLastIndex(
    (message, index) =>
      message.type === "compaction" &&
      message.status === "completed" &&
      index < end
  );
  return messages.findLast(
    (message, index): message is AssistantWithUsage =>
      message.type === "assistant" &&
      message.tokens !== undefined &&
      index > compactionIndex &&
      index < end
  );
}

export function getContextData(snapshot: ContextSnapshot): ContextData | undefined {
  const { messages, session, models, providers } = snapshot;
  const last = lastAssistantWithUsage(messages, session?.revert?.messageID);
  if (!last) return undefined;
  const tokens = tokenTotal(last.tokens);
  if (!tokens) return undefined;

  const model = models.find(
    (item) =>
      item.providerID === last.model.providerID &&
      (item.id === last.model.id || item.modelID === last.model.id)
  );
  const provider = providers.find((item) => item.id === last.model.providerID);
  const limit = model?.limit.context ?? 0;

  const estimatorMessages = messages.map(toEstimator);

  // System-prompt estimate: OpenCode does not persist the assembled system
  // prompt, so use the first-request residual — everything the provider saw
  // on the first turn minus the user content that preceded it. That covers
  // the real system prompt, tool definitions, rules files and environment
  // context.
  const systemTokens = estimateSystemResidual(estimatorMessages);

  // Categories are scaled to the full used portion of the window (not just
  // non-cached input), so the used squares are fully accounted for.
  const segments = estimateBreakdown({
    messages: estimatorMessages,
    input: tokens,
    systemTokens
  });

  return {
    modelLabel: model?.name ?? last.model.id,
    providerLabel: provider?.name ?? last.model.providerID,
    tokens,
    limit,
    percent: limit ? Math.round((tokens / limit) * 100) : null,
    cost: session?.cost ?? 0,
    segments
  };
}

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
  messages: readonly EstimatorMessage[]
): number | undefined {
  let leadingUserChars = 0;
  for (const msg of messages) {
    if (msg.type === "user") {
      leadingUserChars += msg.text?.length ?? 0;
      continue;
    }
    if (msg.type !== "assistant") continue;
    const tokens = msg.tokens;
    if (!tokens) continue;
    const firstInput = tokens.input + tokens.cache.read + tokens.cache.write;
    if (firstInput <= 0) return undefined;
    return Math.max(0, firstInput - estimateTokens(leadingUserChars));
  }
  return undefined;
}

// Re-exported for convenience; the user-visible chars estimator is shared
// with the breakdown module.
export { userMessageChars };
