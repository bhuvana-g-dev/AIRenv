import { describe, expect, it } from "vitest";
import {
  advisoryToastTitle,
  communityRecommendations,
  eventMeta,
  monthlyTotals,
  overviewItems,
  participationTypes,
  recordPayload,
  resolveSelection,
  splitEvents,
  type RecordDraft,
} from "./community";
import { plural } from "./format";
import type { CommunityDetail, CommunityEvent, CommunityStats, Recommendation } from "./types";

const event = (over: Partial<CommunityEvent>): CommunityEvent => ({
  id: "e1",
  community_id: "c1",
  source: "manual",
  kind: "activity",
  title: "Sports day",
  created_at: "2025-01-01T00:00:00Z",
  ...over,
});

describe("plural", () => {
  it("picks the singular only for one", () => {
    expect(plural(1, "record")).toBe("1 record");
    expect(plural(0, "record")).toBe("0 records");
    expect(plural(2, "advisory", "advisories")).toBe("2 advisories");
  });
});

describe("resolveSelection", () => {
  const cs = [{ id: "a" }, { id: "b" }];
  it("keeps a valid selection and otherwise falls back to the first community", () => {
    expect(resolveSelection(cs, "b")).toBe("b");
    expect(resolveSelection(cs, null)).toBe("a");
    expect(resolveSelection(cs, "gone")).toBe("a");
  });
  it("leaves the selection alone when there are no communities", () => {
    expect(resolveSelection([], "x")).toBe("x");
  });
});

describe("eventMeta", () => {
  it("describes a Telegram event with approximate time", () => {
    const meta = eventMeta(
      event({
        date: "2025-01-10",
        time: "15:00",
        time_precision: "approx_hour",
        outdoor: true,
        intensity: "high",
        source: "telegram",
        group_title: "Parents",
      }),
    );
    expect(meta).toMatch(/ · 15:00 \(approx hour\) · outdoor · high intensity · via Telegram \(Parents\)$/);
  });

  it("falls back for missing date and time and manual entries", () => {
    expect(eventMeta(event({ outdoor: false, intensity: "light" }))).toBe(
      "date unknown · time not stated · indoor · light intensity · via manual entry",
    );
  });
});

describe("advisoryToastTitle", () => {
  it("distinguishes sent, approved and dismissed", () => {
    expect(advisoryToastTitle("approve", "sent")).toBe("Advisory sent to Telegram");
    expect(advisoryToastTitle("approve", "approved")).toBe("Advisory approved");
    expect(advisoryToastTitle("dismiss", "dismissed")).toBe("Advisory dismissed");
  });
});

describe("recordPayload", () => {
  const rec: RecordDraft = { date: "2025-01-10", participants: 5, quantity: 0, km_shifted: 0, evidence_note: "", verified: true };

  it("adds transport modes for carpool and public transport", () => {
    expect(recordPayload("carpool", rec)).toMatchObject({ alternative_mode: "petrol_car", occupants: 3, km_shifted: null });
    expect(recordPayload("public_transport", { ...rec, km_shifted: 12 })).toMatchObject({ alternative_mode: "metro", km_shifted: 12 });
  });

  it("sends other initiatives unchanged apart from the distance", () => {
    expect(recordPayload("waste_segregation", rec)).toEqual({ ...rec, km_shifted: null });
  });
});

describe("participation stats", () => {
  const rows: CommunityStats["monthly_verified_participation"] = [
    { month: "2025-01", carpool: 4, no_burn: 2 },
    { month: "2025-02", carpool: 3 },
  ];
  it("collects initiative types and sums each month", () => {
    const types = participationTypes(rows);
    expect(types).toEqual(["carpool", "no_burn"]);
    expect(monthlyTotals(rows, types)).toEqual([
      { label: "2025-01", value: 6 },
      { label: "2025-02", value: 3 },
    ]);
  });
});

describe("communityRecommendations", () => {
  it("keeps community, school and community-event recommendations", () => {
    const recs = [
      { id: "1", audience: "communities", category: "x" },
      { id: "2", audience: "schools", category: "x" },
      { id: "3", audience: "everyone", category: "community_event" },
      { id: "4", audience: "everyone", category: "health" },
    ] as Recommendation[];
    expect(communityRecommendations(recs).map((r) => r.id)).toEqual(["1", "2", "3"]);
  });
});

describe("splitEvents and overviewItems", () => {
  const events = [
    event({ id: "a", risk: { summary: "", confidence: "high", respond: true, level: "poor" }, advisory: { status: "pending" } }),
    event({ id: "b", kind: "concern" }),
  ];
  const detail = {
    community: { location: { name: "Delhi" } },
    events,
    stats: { totals: { verified_participants: 12, pending_records: 1, verified_records: 3 } },
  } as unknown as CommunityDetail;

  it("separates activities from concerns", () => {
    const { upcoming, concerns } = splitEvents(events);
    expect(upcoming.map((e) => e.id)).toEqual(["a"]);
    expect(concerns.map((e) => e.id)).toEqual(["b"]);
  });

  it("counts risks, pending advisories and records", () => {
    const items = overviewItems(detail, undefined);
    expect(items.map((i) => [i.label, i.value])).toEqual([
      ["Current NAQI", null],
      ["PM2.5 now", null],
      ["Activities at risk", 1],
      ["Verified participants", 12],
      ["Environmental concerns", 1],
    ]);
    expect(items[0].sub).toBe("loading");
    expect(items[2].sub).toBe("1 advisory awaiting approval");
    expect(items[3].sub).toBe("1 record pending verification");
  });
});
