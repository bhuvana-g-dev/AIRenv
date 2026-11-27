import type { Metric } from "./metrics";
import type { Series } from "./types";

export interface TrendPoint {
  t: string;
  observed: number | null;
  forecast: number | null;
  value: number | null;
  isForecast: boolean;
}

/**
 * Chart points around "now": `observed` up to and including now, `forecast` from now on (the
 * shared point joins the two lines), limited to `pastHours` before and `futureHours` after.
 */
export function trendPoints(
  series: Pick<Series, "times" | "now_index" | "hourly">,
  metric: Metric,
  pastHours: number,
  futureHours: number,
): TrendPoint[] {
  const ni = series.now_index;
  const start = Math.max(0, ni - pastHours);
  const end = Math.min(series.times.length, ni + futureHours + 1);
  const vals = series.hourly[metric];
  const out: TrendPoint[] = [];
  for (let i = start; i < end; i++) {
    const v = vals[i] ?? null;
    out.push({ t: series.times[i], observed: i <= ni ? v : null, forecast: i >= ni ? v : null, value: v, isForecast: i > ni });
  }
  return out;
}

/** Y-axis ceiling: next 50 above max+30 for NAQI (capped at 500), else 15 % headroom rounded to 10. */
export function trendYMax(metric: Metric, points: TrendPoint[]): number {
  const max = Math.max(...points.map((d) => d.value ?? 0));
  return metric === "aqi_in" ? Math.min(500, Math.ceil((max + 30) / 50) * 50) : Math.ceil((max * 1.15) / 10) * 10;
}

/** X-axis tick: weekday at midnight, otherwise HH:MM. */
export function trendTick(t: string, dayLabel: (iso: string) => string): string {
  return t.slice(11, 13) === "00" ? dayLabel(t).slice(0, 3) : t.slice(11, 16);
}
