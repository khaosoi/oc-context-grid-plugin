/** @jsxImportSource @opentui/solid */
import type { TuiThemeCurrent } from "@opencode-ai/plugin/tui";
import { gridRows, glyphFor, type Square } from "../grid";
import { categoryColor } from "./colors";

/**
 * Renders squares as one <text> per row with a coloured <span> per square.
 * A trailing space keeps glyphs visually separated, like Claude Code's grid.
 */
export function Grid(props: {
  squares: Square[];
  columns: number;
  theme: () => TuiThemeCurrent;
}) {
  return (
    <>
      {gridRows(props.squares, props.columns).map((row) => (
        <text>
          {row.map((square) => (
            <span style={{ fg: categoryColor(props.theme(), square.key) }}>
              {glyphFor(square)}{" "}
            </span>
          ))}
        </text>
      ))}
    </>
  );
}
