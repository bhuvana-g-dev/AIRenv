import type { Series } from "./types";

export interface ActivityWindow {
  /** Index into `series.times` of the window's first hour. */
  i: number;
  /** Mean forecast PM2.5 over the window (µg/m³). */
  mean: number;
}

const WINDOW_HOURS = 2;
const HORIZON_HOURS = 36;
const FIRST_START_HOUR = 6;
const LAST_END_HOUR = 21;
const MAX_WINDOWS = 3;

/**
 * Daytime two-hour activity windows in the next 36 h, ranked by mean forecast PM2.5.
 * Returns the cleanest non-overlapping windows (up to three) and the dirtiest candidate.
 */
export function cleanerWindows(series: Pick<Series, "times" | "now_index" | "hourly">): {
  chosen: ActivityWindow[];
  worst: ActivityWindow | null;
} {
  const ni = series.now_index;
  const pm = series.hourly.pm2_5;
  const candidates: ActivityWindow[] = [];
  for (let i = ni; i < Math.min(series.times.length - WINDOW_HOURS, ni + HORIZON_HOURS); i++) {
    const h = Number(series.times[i].slice(11, 13));
    if (h < FIRST_START_HOUR || h + WINDOW_HOURS > LAST_END_HOUR) continue;
    const a = pm[i];
    const b = pm[i + 1];
    if (a == null || b == null) continue;
    candidates.push({ i, mean: (a + b) / 2 });
  }
  candidates.sort((x, y) => x.mean - y.mean);
  const chosen: ActivityWindow[] = [];
  for (const c of candidates) {
    if (chosen.every((o) => Math.abs(o.i - c.i) >= WINDOW_HOURS)) chosen.push(c);
    if (chosen.length === MAX_WINDOWS) break;
  }
  return { chosen, worst: candidates.length ? candidates[candidates.length - 1] : null };
}

/** "Fri 14:00–16:00" for a window starting at `times[i]`. */
export function windowLabel(times: string[], i: number): string {
  const day = new Date(times[i].slice(0, 10) + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short" });
  return `${day} ${times[i].slice(11, 16)}–${times[i + WINDOW_HOURS]?.slice(11, 16)}`;
}
