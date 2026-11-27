import type { CommunityStats } from "../../lib/types";

export interface Dose {
  start: string;
  mean_pm2_5: number;
  inhaled_ug: number;
  sub_index: number;
}

export interface ExposureResult {
  planned: Dose | null;
  alternatives: Dose[];
  best: Dose | null;
  reduction_pct: number | null;
  inhalation_rate_m3_per_h: number;
  assumptions: string[];
  sources: string[];
  uncertainty: string;
  forecast: { time: string; pm2_5: number | null }[];
  is_demo: boolean;
}

export interface ExposureParams {
  lat: number;
  lon: number;
  activity_hours: number;
  intensity: string;
  planned_start: string;
  demo: boolean;
}

export interface Band {
  estimate: number;
  low: number;
  high: number;
}

export interface TripInput {
  baseline_mode: string;
  alternative_mode: string;
  distance_km: number;
  trips_per_week: number;
  baseline_occupants: number;
  alternative_occupants: number;
}

export interface TripResult {
  km_per_week: number;
  baseline_kg_per_week: number;
  alternative_kg_per_week: number;
  avoided_kg: { week: Band; month: Band; year: Band };
  methodology: string[];
  source: string;
}

export interface EnergyInput {
  electricity_kwh_saved_per_month: number;
  lpg_kg_saved_per_month: number;
}

export interface EnergyResult {
  electricity_kg_per_month: number;
  lpg_kg_per_month: number;
  total_kg_per_month: Band;
  total_kg_per_year: number;
  methodology: string[];
}

export interface Factors {
  transport: Record<string, { label: string; kg_per_km: number; per: string }>;
  transport_source: string;
}

export interface CommunityImpact {
  communities: { id: string; name: string; type: string; is_demo: boolean; stats: CommunityStats }[];
  open_burning_concerns_detected: number;
  disclaimer: string;
}
