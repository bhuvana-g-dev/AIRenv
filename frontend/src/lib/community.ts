import { colorForAqi, colorForPm25 } from "./aqi";
import { localDate, plural } from "./format";
import type { Community, CommunityDetail, CommunityEvent, CommunityStats, Recommendation, Snapshot } from "./types";

export const COMMUNITY_TYPE_LABEL: Record<string, string | undefined> = {
  school: "School",
  apartment: "Apartment",
  rwa: "RWA",
  community_org: "Organisation",
  workplace: "Workplace",
};

/** Colours for stacked participation bars, cycled per initiative type. */
export const PARTICIPATION_COLORS = ["#35D399", "#55D6E8", "#A78BFA", "#FACC15", "#FB923C", "#7CE7B4"];

/** Keeps the current selection while it still exists, otherwise selects the first community. */
export function resolveSelection(communities: Pick<Community, "id">[], selected: string | null): string | null {
  if (!communities.length) return selected;
  if (selected && communities.some((c) => c.id === selected)) return selected;
  return communities[0].id;
}

/** One-line description of when, where and how an event was reported. */
export function eventMeta(ev: CommunityEvent): string {
  const date = ev.date ? localDate(ev.date) : "date unknown";
  const precision = ev.time_precision && ev.time_precision !== "exact" && ev.time ? ` (${ev.time_precision.replace("_", " ")})` : "";
  const setting = ev.outdoor === false ? "indoor" : "outdoor";
  const via = ev.source === "telegram" ? `Telegram${ev.group_title ? ` (${ev.group_title})` : ""}` : "manual entry";
  return `${date} · ${ev.time ?? "time not stated"}${precision} · ${setting} · ${ev.intensity ?? ""} intensity · via ${via}`;
}

/** Toast title after an administrator approves or dismisses an advisory. */
export function advisoryToastTitle(action: "approve" | "dismiss", status: string | undefined): string {
  if (action === "dismiss") return "Advisory dismissed";
  return status === "sent" ? "Advisory sent to Telegram" : "Advisory approved";
}

export interface RecordDraft {
  date: string;
  participants: number;
  quantity: number;
  km_shifted: number;
  evidence_note: string;
  verified: boolean;
}

/**
 * Request body for a participation record. Transport initiatives carry the mode pair the
 * backend needs to estimate avoided emissions; a zero distance is sent as "not recorded".
 */
export function recordPayload(initiativeType: string | undefined, rec: RecordDraft) {
  const transport =
    initiativeType === "carpool"
      ? { baseline_mode: "petrol_car", alternative_mode: "petrol_car", occupants: 3 }
      : initiativeType === "public_transport"
        ? { baseline_mode: "petrol_car", alternative_mode: "metro", occupants: 1 }
        : {};
  return { ...rec, km_shifted: rec.km_shifted || null, ...transport };
}

/** Initiative types that appear in the monthly participation rows (every key except "month"). */
export function participationTypes(rows: CommunityStats["monthly_verified_participation"]): string[] {
  return Array.from(new Set(rows.flatMap((r) => Object.keys(r).filter((k) => k !== "month"))));
}

/** Total verified participants per month across all initiative types. */
export function monthlyTotals(rows: CommunityStats["monthly_verified_participation"], types: string[]) {
  return rows.map((r) => ({ label: String(r.month), value: types.reduce((sum, t) => sum + (Number(r[t]) || 0), 0) }));
}

/** Briefing recommendations aimed at communities or schools, or about community events. */
export function communityRecommendations(recs: Recommendation[]): Recommendation[] {
  return recs.filter((r) => ["communities", "schools"].includes(r.audience) || r.category === "community_event");
}

export function splitEvents(events: CommunityEvent[]) {
  return {
    upcoming: events.filter((e) => e.kind === "activity"),
    concerns: events.filter((e) => e.kind === "concern"),
  };
}

export interface OverviewItem {
  label: string;
  value: number | null;
  sub: string;
  color: string | undefined;
}

/** Headline figures for a community: current air at its location plus activity and participation counts. */
export function overviewItems(detail: CommunityDetail, snapshot: Snapshot | undefined): OverviewItem[] {
  const { events, stats, community } = detail;
  const pending = events.filter((e) => e.advisory?.status === "pending").length;
  const atRisk = events.filter((e) => e.risk?.respond).length;
  const concerns = events.filter((e) => e.kind === "concern").length;
  const s = snapshot;
  return [
    {
      label: "Current NAQI",
      value: s ? s.aqi.value : null,
      sub: s ? `${s.aqi.category?.label ?? "Unavailable"} · ${community.location.name}` : "loading",
      color: s ? colorForAqi(s.aqi.value) : undefined,
    },
    {
      label: "PM2.5 now",
      value: s ? s.pollutants.pm2_5.value : null,
      sub: "µg/m³ · model estimate",
      color: s ? colorForPm25(s.pollutants.pm2_5.value) : undefined,
    },
    {
      label: "Activities at risk",
      value: atRisk,
      sub: `${plural(pending, "advisory", "advisories")} awaiting approval`,
      color: atRisk ? "#FB923C" : "#35D399",
    },
    {
      label: "Verified participants",
      value: stats.totals.verified_participants,
      sub: `${plural(stats.totals.pending_records, "record")} pending verification`,
      color: "#55D6E8",
    },
    { label: "Environmental concerns", value: concerns, sub: "e.g. open burning discussed", color: concerns ? "#FACC15" : "#35D399" },
  ];
}
