import { colorForPm25 } from "./aqi";
import { fmtNum, localDayHour } from "./format";
import type { Series } from "./types";

/** Minimal shapes the helpers need, so they stay independent of the page's API types. */
interface DoseLike {
  start: string;
  mean_pm2_5: number;
  inhaled_ug: number;
}
interface ExposureLike {
  planned: DoseLike | null;
  best: DoseLike | null;
  reduction_pct: number | null;
  forecast: { time: string }[];
}

const FIRST_DAYTIME_HOUR = 5;
const LAST_DAYTIME_HOUR = 21;
const PLANNING_HORIZON_H = 48;

/** Daytime (05:00–21:00) forecast hours in the next 48 h that an activity can be planned for. */
export function daytimeStartOptions(series: Pick<Series, "times" | "now_index"> | undefined): string[] {
  if (!series) return [];
  return series.times.slice(series.now_index, series.now_index + PLANNING_HORIZON_H).filter((t) => {
    const h = Number(t.slice(11, 13));
    return h >= FIRST_DAYTIME_HOUR && h <= LAST_DAYTIME_HOUR;
  });
}

/** Default planned start: the first 08:00 slot, else the first option. */
export function defaultPlannedStart(options: string[]): string | undefined {
  return options.find((t) => t.slice(11, 13) === "08") ?? options[0];
}

/**
 * Forecast time at which an activity starting at `start` and lasting `hours` ends, clamped
 * to the last forecast hour. Used as the right edge of the highlighted chart window.
 */
export function windowEnd(forecast: { time: string }[], start: string, hours: number): string | undefined {
  const i = forecast.findIndex((f) => f.time === start);
  return forecast[Math.min(i + hours, forecast.length - 1)]?.time;
}

/** True when shifting the activity would reduce exposure. */
export function hasReduction(r: Pick<ExposureLike, "reduction_pct">): boolean {
  return (r.reduction_pct ?? 0) > 0;
}

/** Screen-reader description of the forecast chart with the planned and cleanest windows. */
export function exposureForecastLabel(r: ExposureLike): string {
  const planned = r.planned ? `; planned window from ${localDayHour(r.planned.start)} averages ${fmtNum(r.planned.mean_pm2_5)} µg/m³` : "";
  const best = r.best ? `; cleanest window from ${localDayHour(r.best.start)} averages ${fmtNum(r.best.mean_pm2_5)} µg/m³` : "";
  return `Forecast PM2.5 for the next ${r.forecast.length} hours${planned}${best}.`;
}

/** Live-region sentence announcing the new estimate. */
export function exposureAnnouncement(r: ExposureLike): string {
  const reduction = hasReduction(r) ? `, a ${fmtNum(r.reduction_pct)}% reduction` : "";
  return `Estimated inhaled PM2.5: ${fmtNum(r.planned?.inhaled_ug)} µg at the planned time, ${fmtNum(r.best?.inhaled_ug)} µg at the cleanest window${reduction}.`;
}

/** Planned-vs-best bars for the inhaled-dose comparison chart (empty unless both exist). */
export function exposureBars(r: ExposureLike): { name: string; v: number; c: string }[] {
  if (!r.planned || !r.best) return [];
  return [
    { name: "Planned", v: r.planned.inhaled_ug, c: colorForPm25(r.planned.mean_pm2_5) },
    { name: "Best window", v: r.best.inhaled_ug, c: "#35D399" },
  ];
}

/** Width (%) of a bar relative to the larger of two values; never divides by zero. */
export function relativeWidthPct(value: number, a: number, b: number): number {
  return (value / Math.max(a, b, 0.01)) * 100;
}
