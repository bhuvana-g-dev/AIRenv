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
  weather: {
    time?: string;
    temperature_c: number | null;
    humidity_pct: number | null;
    wind_speed_kmh: number | null;
    wind_direction_deg: number | null;
    weather_code: number | null;
    weather_text: string;
    boundary_layer_m: number | null;
  } | null;
  sources: { air: Source; weather: Source | null };
  freshness: { age_minutes: number | null; status: "fresh" | "aging" | "stale" | "unknown" | "demo" };
  analysis: {
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
  };
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

export interface DataRef {
  label: string;
  value: number | string | null;
  unit: string | null;
  source?: string | null;
  source_type?: string | null;
  observed_at?: string | null;
}

export interface Recommendation {
  id: string;
  category: string;
  priority: number;
  title: string;
  what_is_happening: string;
  why_it_matters: string;
  action: string;
  alternative: string;
  expected_benefit: string;
  benefit_type: "exposure" | "emissions" | "qualitative";
  confidence: { level: "high" | "medium" | "low"; reason: string };
  audience: string;
  data_refs: DataRef[];
}

export interface Briefing {
  headline: string;
  summary: string;
  key_points: string[];
  recommendations: Recommendation[];
  generated_by: "gemini" | "rules";
  generated_at: string;
  language: string;
  observed_at: string | null;
  is_demo: boolean;
  ai_available: boolean;
  ai_note?: string;
}

export interface FeedItem {
  id: string;
  location_id: string;
  type: string;
  severity: Severity;
  title: string;
  detail: string | null;
  created_at: string;
}

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

export interface NotificationItem {
  id: string;
  key: string;
  category: "critical" | "deterioration" | "forecast" | "community" | "recommendation" | "positive";
  severity: Severity;
  priority: number;
  title: string;
  message: string;
  created_at: string;
  read: boolean;
  delivery: { in_app: boolean; telegram: string };
}

export interface FamilyContext {
  children: boolean;
  older_adults: boolean;
  respiratory_or_heart_condition: boolean;
  outdoor_workers: boolean;
  pregnancy: boolean;
}

export interface NotificationPrefs {
  in_app: boolean;
  telegram: boolean;
  min_severity: Severity;
  quiet_hours: { enabled: boolean; start: string; end: string };
  categories: Record<string, boolean>;
  daily_limit: number;
}

export interface Profile {
  uid: string;
  email: string | null;
  display_name: string;
  role: "member" | "community_admin" | "admin";
  auth_mode: "local" | "firebase";
  onboarded: boolean;
  location: Location;
  community_type: string;
  family_context: FamilyContext;
  notification_prefs: NotificationPrefs;
  language: string;
  privacy: {
    conversation_intelligence: boolean;
    store_extracted_events: boolean;
    share_aggregate_participation: boolean;
    event_retention_days: number;
  };
  data_sources: Record<string, boolean>;
  telegram: { chat_id: number; linked_at: string; username?: string } | null;
  community_ids: string[];
}

export interface EventRisk {
  level: string;
  sub_index?: number;
  forecast_pm2_5?: number;
  category?: string;
  category_label?: string;
  event_time?: string;
  hours_ahead?: number;
  summary: string;
  action?: string;
  alternative?: string;
  benefit?: string;
  best_alternative?: { start: string; mean_pm2_5: number } | null;
  confidence: string;
  respond: boolean;
}

export interface CommunityEvent {
  id: string;
  community_id: string;
  source: "manual" | "telegram";
  kind: "activity" | "concern" | "transport";
  title: string;
  activity_type?: string;
  concern_type?: string;
  intensity?: string;
  outdoor?: boolean | null;
  date?: string;
  time?: string | null;
  time_precision?: string;
  duration_hours?: number;
  group_title?: string;
  risk?: EventRisk | null;
  advisory?: { status: "none" | "pending" | "sent" | "approved" | "dismissed"; text?: string; delivery_errors?: string[] };
  is_demo?: boolean;
  created_at: string;
}

export interface Community {
  id: string;
  name: string;
  type: string;
  location: Location;
  admin_uids: string[];
  is_demo?: boolean;
  can_manage: boolean;
  event_count?: number;
  pending_advisories?: number;
  group_count?: number;
}

export interface CommunityStats {
  by_type: {
    type: string;
    label: string;
    verified_participants: number;
    unverified_participants: number;
    verified_quantity: number;
    unit: string;
    verified_records: number;
    pending_records: number;
  }[];
  monthly_verified_participation: ({ month: string } & Record<string, number | string>)[];
  estimated_emissions_avoided: { estimate_kg: number; low_kg: number; high_kg: number; records_used: number; note: string };
  totals: { verified_records: number; pending_records: number; verified_participants: number };
  disclaimer: string;
}

export interface Initiative {
  id: string;
  type: string;
  label: string;
  title: string;
  description: string;
  is_demo?: boolean;
  records: {
    id: string;
    date: string;
    participants: number;
    quantity: number;
    verified: boolean;
    evidence_note: string;
    km_shifted?: number | null;
  }[];
}

export interface TgGroup {
  id: string;
  chat_id: string;
  title: string;
  authorized: boolean;
  reply_mode: "approval" | "auto";
  opted_in_at: string | null;
  is_demo?: boolean;
}

export interface CommunityDetail {
  community: Community;
  events: CommunityEvent[];
  groups: TgGroup[];
  initiatives: Initiative[];
  stats: CommunityStats;
  initiative_types: Record<string, { label: string; unit: string }>;
}

export interface SystemStatus {
  version: string;
  storage: string;
  auth_mode: string;
  scheduler: {
    last_run_at: string | null;
    next_run_at: string | null;
    interval_minutes: number;
    enabled: boolean;
    runs: number;
    last_errors: string[];
  };
  live_subscribers: number;
  integrations: Record<string, { configured: boolean; env?: string; note?: string; [k: string]: unknown }>;
}

export interface AssistantReply {
  answer: string;
  cards: Recommendation[];
  uncertainty: string;
  follow_ups: string[];
  intent: string;
  generated_by: "gemini" | "rules";
  data_refs: DataRef[];
  is_demo: boolean;
}
