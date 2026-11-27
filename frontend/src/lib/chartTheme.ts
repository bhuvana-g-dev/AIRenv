import type { CSSProperties } from "react";

/** Axis tick colour: the `--color-faint` token, ≥4.5:1 on the dark card surfaces. */
export const AXIS_TICK = "#869B90";

/** Shared tick style for recharts axes. */
export const AXIS_TICK_STYLE = { fill: AXIS_TICK, fontSize: 10 };

/** Horizontal grid line colour. */
export const GRID_STROKE = "rgba(124,231,180,0.06)";

/** Content style for the default recharts tooltip, matching the glass surfaces. */
export const TOOLTIP_STYLE: CSSProperties = {
  background: "#10231B",
  border: "1px solid rgba(124,231,180,0.15)",
  borderRadius: 12,
  fontSize: 12,
};
