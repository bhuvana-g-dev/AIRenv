/** Profile, notification and system-status shapes (/api/me, /api/notifications, /api/system). */
import type { Location, Severity } from "./air";

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
