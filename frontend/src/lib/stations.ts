import { categoryForAqi } from "./aqi";
import type { Location, Station } from "./types";

export type MarkerKind = Station["station_type"] | "model";

export function stationKindLabel(type: Station["station_type"]): string {
  return type === "reference" ? "reference monitor" : "low-cost sensor";
}

/** Accessible name for a station marker or list entry. */
export function stationLabel(s: Station): string {
  const cat = categoryForAqi(s.aqi.value)?.label;
  return `${s.name}: NAQI ${s.aqi.value ?? "unavailable"}${cat ? ` (${cat})` : ""}, ${stationKindLabel(s.station_type)}, ${s.distance_km} km`;
}

/**
 * Size and HTML for a map marker. Reference monitors are dots, low-cost sensors diamonds,
 * the model estimate a dashed ring; the selected station is drawn larger.
 */
export function markerSpec(color: string, kind: MarkerKind, selected = false): { size: number; html: string } {
  const size = kind === "model" ? 22 : selected ? 20 : 16;
  const shape = kind === "low_cost" ? "border-radius:4px;transform:rotate(45deg);" : "border-radius:9999px;";
  const inner =
    kind === "model"
      ? `<div style="width:${size}px;height:${size}px;border-radius:9999px;border:2px dashed ${color};background:${color}33;"></div>`
      : `<div style="width:${size}px;height:${size}px;${shape}background:${color};border:2px solid #07110E;box-shadow:0 0 12px ${color}aa;"></div>`;
  return { size, html: `<span class="ring" style="background:${color}55"></span>${inner}` };
}

/** Percentage by which a station's PM2.5 differs from the model estimate (positive = station higher). */
export function differenceFromModelPct(stationPm: number, modelPm: number): number {
  return ((stationPm - modelPm) / modelPm) * 100;
}

/** Ad-hoc location for a point clicked on the map. */
export function pointLocation(lat: number, lon: number): Location {
  return { id: `${lat.toFixed(2)}_${lon.toFixed(2)}`, name: `Point ${lat.toFixed(3)}, ${lon.toFixed(3)}`, lat, lon };
}

/** "PM2.5" style label for a reading key such as "pm2_5". */
export function readingLabel(key: string): string {
  return key.toUpperCase().replace("_", ".");
}
