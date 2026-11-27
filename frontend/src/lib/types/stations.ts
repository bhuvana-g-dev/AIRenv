/** Monitoring stations and history responses (/api/air/stations, /api/air/history). */
import type { Category, PollutantKey } from "./air";

export interface Station {
  id: string;
  provider: string;
  station_type: "reference" | "low_cost";
  name: string;
  city: string | null;
  state: string | null;
  lat: number;
  lon: number;
  distance_km: number;
  observed_at: string | null;
  readings: Partial<Record<PollutantKey, { value: number; unit: string; averaging: string }>>;
  url?: string;
  owner?: string;
  aqi: { value: number | null; dominant_pollutant: PollutantKey | null; category: Category | null };
}

export interface StationsResponse {
  stations: Station[];
  providers: { key: string; name: string; status: "ok" | "unavailable"; message: string | null; count: number }[];
  hotspots: { station_id: string; name: string; pm2_5: number; local_median: number; ratio: number }[];
  hotspot_method: string;
  fetched_at: string;
}

export interface HistoryResponse {
  comparisons: {
    basis: string;
    current_pm2_5: number | null;
    vs_yesterday_same_hour: { value: number | null; change_pct: number | null };
    vs_week_ago_same_hour: { value: number | null; change_pct: number | null };
    seven_day_mean: number | null;
    vs_seven_day_mean_pct: number | null;
    daily: { date: string; pm2_5_mean: number; pm2_5_max: number; aqi_mean: number | null; hours: number }[];
    hour_of_day_profile: { hour: number; pm2_5_mean: number }[];
    typically_cleanest_daytime_hours: { hour: number; pm2_5_mean: number }[];
  };
  recorded: { hour: string; aqi_in: number | null; pm2_5: number | null; recorded_at: string }[];
  recorded_note: string;
  is_demo: boolean;
}
