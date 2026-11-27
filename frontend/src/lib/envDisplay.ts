import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CloudFog,
  Droplets,
  Gauge,
  Minus,
  Thermometer,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { fmtNum, windDirection } from "./format";
import type { Snapshot } from "./types";

/** Label/value pairs for the weather strip; "—" where the weather feed is missing. */
export function weatherItems(w: Snapshot["weather"]): { icon: LucideIcon; label: string; value: string }[] {
  return [
    { icon: Thermometer, label: "Temperature", value: w ? `${fmtNum(w.temperature_c, 1)} °C` : "—" },
    { icon: Droplets, label: "Humidity", value: w ? `${fmtNum(w.humidity_pct)} %` : "—" },
    { icon: Wind, label: "Wind", value: w ? `${fmtNum(w.wind_speed_kmh, 1)} km/h ${windDirection(w.wind_direction_deg)}` : "—" },
    { icon: CloudFog, label: "Weather", value: w?.weather_text ?? "—" },
    { icon: Gauge, label: "Mixing height", value: w?.boundary_layer_m != null ? `${fmtNum(w.boundary_layer_m)} m` : "—" },
  ];
}

/** Top of the NAQI scale. */
export const AQI_MAX = 500;

/** Accessible name for the AQI gauge, e.g. "NAQI 286 out of 500, Poor". */
export function gaugeLabel(label: string, value: number | null, category: Snapshot["aqi"]["category"]): string {
  if (value == null) return `${label} unavailable`;
  return `${label} ${value} out of ${AQI_MAX}${category ? `, ${category.label}` : ""}`;
}

/** Width (0–100 %) of a sub-index bar on the NAQI scale. */
export function subIndexWidthPct(sub: number | null): number {
  return Math.min(100, ((sub ?? 0) / AQI_MAX) * 100);
}

/** Colour and label for a data-freshness status. */
export const FRESHNESS_VIEW: Record<Snapshot["freshness"]["status"], { color: string; label: string }> = {
  fresh: { color: "#35D399", label: "Fresh" },
  aging: { color: "#FACC15", label: "Aging" },
  stale: { color: "#FB923C", label: "Stale" },
  unknown: { color: "#94A89D", label: "Unknown age" },
  demo: { color: "#A78BFA", label: "Sample data" },
};

export interface TrendView {
  icon: LucideIcon;
  color: string;
  label: string;
}

const TRENDS: Record<string, TrendView> = {
  rising: { icon: ArrowUpRight, color: "#FB923C", label: "Rising" },
  worsening: { icon: ArrowUpRight, color: "#FB923C", label: "Worsening" },
  falling: { icon: ArrowDownRight, color: "#35D399", label: "Falling" },
  improving: { icon: ArrowDownRight, color: "#35D399", label: "Improving" },
  steady: { icon: Minus, color: "#94A89D", label: "Steady" },
  similar: { icon: ArrowRight, color: "#94A89D", label: "Similar" },
  unknown: { icon: Minus, color: "#869B90", label: "Unknown" },
};

/** Icon, colour and label for a trend or outlook direction; unrecognised values read as "Unknown". */
export function trendView(direction: string): TrendView {
  return Object.hasOwn(TRENDS, direction) ? TRENDS[direction] : TRENDS.unknown;
}

/** "+12%" / "-5%" / "0%" for a percentage change. */
export function signedPct(change: number): string {
  return `${change > 0 ? "+" : ""}${change}%`;
}

export const CONFIDENCE_VIEW = {
  high: { color: "#35D399", bars: 3 },
  medium: { color: "#FACC15", bars: 2 },
  low: { color: "#FB923C", bars: 1 },
} as const;

/** Badge colour for a recommendation's benefit type. */
export function benefitColor(type: "exposure" | "emissions" | "qualitative"): string {
  if (type === "emissions") return "#55D6E8";
  if (type === "exposure") return "#7CE7B4";
  return "#94A89D";
}
