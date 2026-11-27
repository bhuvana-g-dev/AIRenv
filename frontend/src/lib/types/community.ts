/** Community, event, initiative and Telegram-group shapes (/api/communities). */
import type { Location } from "./air";

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
