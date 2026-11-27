/** Air-quality snapshot and time-series shapes returned by /api/air/*. */

export type PollutantKey = "pm2_5" | "pm10" | "no2" | "so2" | "co" | "o3";
export type Severity = "info" | "low" | "medium" | "high" | "critical";

export interface Location {
  id: string;
  name: string;
  lat: number;
  lon: number;
  country?: string | null;
  admin1?: string | null;
  timezone?: string | null;
}

export interface Category {
  key: "good" | "satisfactory" | "moderate" | "poor" | "very_poor" | "severe";
  label: string;
  range: [number, number];
  severity: number;
  health: string;
}

export interface Source {
  name: string;
  type: "model" | "station" | "demo";
  url?: string | null;
  licence?: string;
  note?: string;
}

export interface Pollutant {
  label: string;
  value: number | null;
  unit: string;
  average: { value: number | null; hours_used: number; period_hours: number } | null;
  sub_index: number | null;
  who_24h_guideline: number | null;
}

export interface Trend {
  direction: "rising" | "falling" | "steady" | "unknown";
  change_pct: number | null;
  window_hours: number;
  recent_mean?: number;
  prior_mean?: number;
}

export interface Outlook {
  direction: "worsening" | "improving" | "similar" | "unknown";
  peak: number | null;
  peak_index: number | null;
  mean: number | null;
  change_pct?: number;
  hours: number;
}

export interface Confidence {
  level: "high" | "medium" | "low";
  score: number;
  reasons: string[];
}

export interface Weather {
  time?: string;
  temperature_c: number | null;
  humidity_pct: number | null;
  wind_speed_kmh: number | null;
  wind_direction_deg: number | null;
  weather_code: number | null;
  weather_text: string;
  boundary_layer_m: number | null;
}

export interface Analysis {
  severity: string;
  trend_pm2_5: Trend;
  outlook_12h: Outlook;
  outlook_24h: Outlook;
  dispersion: { level: string; explanation: string; wind_speed_kmh?: number | null; boundary_layer_m?: number | null };
  station_check: null | {
    status: "agrees" | "disagrees";
    station: string;
    provider: string;
    measured_pm2_5: number;
    difference_pct: number;
    distance_km: number;
  };
  confidence: Confidence;
  health_statement: string | null;
  health_source: string;
}

export interface Snapshot {
  location: Location;
  is_demo: boolean;
  status: "live" | "stale" | "demo";
  observed_at: string | null;
  observed_local: string | null;
  fetched_at: string;
  timezone: string | null;
  utc_offset: string;
  aqi: {
    value: number | null;
    valid: boolean;
    scale: string;
    sub_indices: Partial<Record<PollutantKey, number>>;
    dominant_pollutant: PollutantKey | null;
    dominant_label?: string;
    category: Category | null;
    method_note?: string;
  };
  us_aqi: number | null;
  pollutants: Record<PollutantKey, Pollutant>;
  weather: Weather | null;
  sources: { air: Source; weather: Source | null };
  freshness: { age_minutes: number | null; status: "fresh" | "aging" | "stale" | "unknown" | "demo" };
  analysis: Analysis;
  errors: { provider: string; message: string }[];
}

export interface Series {
  location_id: string;
  is_demo: boolean;
  times: string[];
  now_index: number;
  utc_offset: string;
  hourly: Record<PollutantKey | "us_aqi" | "aqi_in", (number | null)[]>;
  weather: Record<"wind_speed_kmh" | "boundary_layer_m" | "temperature_c" | "humidity_pct", (number | null)[]>;
  sources: Snapshot["sources"];
}

export interface Bundle {
  snapshot: Snapshot;
  series: Series;
}
