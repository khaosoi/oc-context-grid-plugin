import type { RGBA } from "@opentui/core";
import type { ResolvedTheme } from "@opencode/theme/tui";
import type { SquareKey } from "../grid";

const CATEGORY_HUES: readonly SquareKey[] = [
  "system", "user", "assistant", "tool", "other"
];

/**
 * Category -> colour, following OpenCode's context tab palette on V2's
 * theme: one slot of the categorical scale per category, muted text for the
 * free space.
 */
export function categoryColor(theme: ResolvedTheme, key: SquareKey): RGBA {
  if (key === "free") return theme.text.muted;
  const index = CATEGORY_HUES.indexOf(key);
  const scale = theme.categorical[index < 0 ? 0 : index] ?? theme.hue.accent;
  return scale[400];
}

export const CATEGORY_LABEL: Record<SquareKey, string> = {
  system: "System",
  user: "User",
  assistant: "Assistant",
  tool: "Tools",
  other: "Other",
  free: "Free space"
};
