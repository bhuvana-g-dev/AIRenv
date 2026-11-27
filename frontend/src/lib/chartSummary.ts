/**
 * Plain-language summaries of chart data for screen-reader users (charts are exposed as
 * `role="img"` with these strings as their accessible name).
 */
import { categoryForAqi } from "./aqi";
import { fmtNum, localDayHour } from "./format";

type Num = number | null | undefined;

function extremes<T>(rows: T[], value: (r: T) => Num) {
  let max: { row: T; v: number } | null = null;
  let min: { row: T; v: number } | null = null;
  for (const row of rows) {
    const v = value(row);
    if (v == null || Number.isNaN(v)) continue;
    if (!max || v > max.v) max = { row, v };
    if (!min || v < min.v) min = { row, v };
  }
  return { max, min };
}

export function trendSummary({
  label,
  unit,
  points,
  nowValue,
  isAqi,
}: {
  label: string;
  unit: string;
  points: { t: string; value: Num; isForecast: boolean }[];
  nowValue: Num;
  isAqi: boolean;
}): string {
  if (!points.some((p) => p.value != null)) return `${label} chart: no data available.`;
  const u = unit ? ` ${unit}` : "";
  const describe = (v: number) => `${fmtNum(v)}${u}${isAqi ? ` (${categoryForAqi(v)?.label ?? "unknown"})` : ""}`;
  const past = points.filter((p) => !p.isForecast);
  const future = points.filter((p) => p.isForecast);
  const parts = [`${label} chart, model history and forecast.`];
  if (nowValue != null) parts.push(`Now: ${describe(nowValue)}.`);
  const p = extremes(past, (x) => x.value);
  if (p.max && p.min) parts.push(`Past ${past.length} hours ranged ${fmtNum(p.min.v)} to ${fmtNum(p.max.v)}${u}.`);
  const f = extremes(future, (x) => x.value);
  if (f.max && f.min)
    parts.push(`Forecast for the next ${future.length} hours: peak ${describe(f.max.v)} at ${localDayHour(f.max.row.t)}, lowest ${fmtNum(f.min.v)}${u} at ${localDayHour(f.min.row.t)}.`);
  return parts.join(" ");
}

export function dailySummary(rows: { date: string; pm2_5_mean: number }[]): string {
  if (rows.length === 0) return "Daily mean PM2.5 chart: no data available.";
  const { max, min } = extremes(rows, (r) => r.pm2_5_mean);
  return `Daily mean PM2.5 for ${rows.length} days from ${rows[0].date} to ${rows[rows.length - 1].date}. Highest ${fmtNum(max!.v)} µg/m³ on ${max!.row.date}; lowest ${fmtNum(min!.v)} µg/m³ on ${min!.row.date}.`;
}

export function hourProfileSummary(rows: { hour: number; pm2_5_mean: number }[], highlight: number[] = []): string {
  if (rows.length === 0) return "Average PM2.5 by hour of day: no data available.";
  const { max, min } = extremes(rows, (r) => r.pm2_5_mean);
  const base = `Average PM2.5 by hour of day. Highest at ${max!.row.hour}:00 (${fmtNum(max!.v)} µg/m³); lowest at ${min!.row.hour}:00 (${fmtNum(min!.v)} µg/m³).`;
  return highlight.length ? `${base} Typically cleanest daytime hours: ${highlight.map((h) => `${h}:00`).join(", ")}.` : base;
}

/** Generic summary for a bar/area series keyed by a label field. */
export function seriesSummary(title: string, rows: { label: string; value: Num }[], unit = ""): string {
  const u = unit ? ` ${unit}` : "";
  const items = rows.filter((r) => r.value != null);
  if (items.length === 0) return `${title}: no data available.`;
  return `${title}: ${items.map((r) => `${r.label} ${fmtNum(r.value)}${u}`).join("; ")}.`;
}
