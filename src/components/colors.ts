import type { TuiThemeCurrent } from "@opencode-ai/plugin/tui";
import type { RGBA } from "@opentui/core";
import type { SquareKey } from "../grid";

/** Category -> theme colour, following OpenCode's context tab palette. */
export function categoryColor(theme: TuiThemeCurrent, key: SquareKey): RGBA {
  switch (key) {
    case "system":
      return theme.info;
    case "user":
      return theme.success;
    case "assistant":
      return theme.primary;
    case "tool":
      return theme.warning;
    case "other":
      return theme.syntaxComment;
    case "free":
      return theme.textMuted;
  }
}

export const CATEGORY_LABEL: Record<SquareKey, string> = {
  system: "System",
  user: "User",
  assistant: "Assistant",
  tool: "Tools",
  other: "Other",
  free: "Free space"
};
