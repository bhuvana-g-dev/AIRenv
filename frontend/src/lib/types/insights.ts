/** AI briefing, recommendations, feed and assistant shapes (/api/insights, /api/feed, /api/assistant). */
import type { Severity } from "./air";

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
