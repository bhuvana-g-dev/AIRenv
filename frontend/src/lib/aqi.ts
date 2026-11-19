import type { Category, Severity } from "./types";

export const CATEGORY_COLORS: Record<Category["key"], string> = {
  good: "#35D399",
  satisfactory: "#A3E635",
  moderate: "#FACC15",
  poor: "#FB923C",
  very_poor: "#EF4444",
  severe: "#C0264F",
};

export const NAQI_BANDS: { key: Category["key"]; label: string; min: number; max: number }[] = [
  { key: "good", label: "Good", min: 0, max: 50 },
  { key: "satisfactory", label: "Satisfactory", min: 51, max: 100 },
  { key: "moderate", label: "Moderate", min: 101, max: 200 },
  { key: "poor", label: "Poor", min: 201, max: 300 },
  { key: "very_poor", label: "Very Poor", min: 301, max: 400 },
  { key: "severe", label: "Severe", min: 401, max: 500 },
];

// CPCB PM2.5 24-h breakpoints (µg/m³) used to colour concentration charts.
export const PM25_BANDS = [30, 60, 90, 120, 250];

export function categoryForAqi(aqi: number | null | undefined) {
  if (aqi == null || Number.isNaN(aqi)) return null;
  return NAQI_BANDS.find((b) => aqi <= b.max) ?? NAQI_BANDS[NAQI_BANDS.length - 1];
}

export function colorForAqi(aqi: number | null | undefined): string {
  const c = categoryForAqi(aqi);
  return c ? CATEGORY_COLORS[c.key] : "#5F7469";
}

export function categoryForPm25(v: number | null | undefined) {
  if (v == null) return null;
  const idx = PM25_BANDS.findIndex((b) => v <= b);
  return NAQI_BANDS[idx === -1 ? 5 : idx];
}

export function colorForPm25(v: number | null | undefined): string {
  const c = categoryForPm25(v);
  return c ? CATEGORY_COLORS[c.key] : "#5F7469";
}

export const SEVERITY_COLORS: Record<Severity, string> = {
  info: "#55D6E8",
  low: "#7CE7B4",
  medium: "#FACC15",
  high: "#FB923C",
  critical: "#EF4444",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  info: "Info",
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};
