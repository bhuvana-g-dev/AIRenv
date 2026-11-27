import { describe, expect, it } from "vitest";
import { DEMO_SAMPLE, sampleReading } from "./landingSample";
import type { Snapshot } from "./types";

const snapshot = (over: Partial<Snapshot> = {}) =>
  ({
    is_demo: false,
    location: { name: "Mumbai" },
    aqi: { value: 142, category: { key: "moderate", label: "Moderate" } },
    pollutants: { pm2_5: { value: 61 }, pm10: { value: 110 }, no2: { value: 22 } },
    observed_local: "2025-01-10T14:00",
    utc_offset: "+05:30",
    sources: { air: { name: "Open-Meteo" } },
    ...over,
  }) as unknown as Snapshot;

describe("sampleReading", () => {
  it("shows a live reading with its source", () => {
    const r = sampleReading(snapshot(), false);
    expect(r.state).toBe("live");
    expect(r.place).toBe("Mumbai");
    expect(r.value).toBe(142);
    expect(r.pollutants).toEqual({ pm2_5: 61, pm10: 110, no2: 22 });
    expect(r.status).toBe("Observed 14:00 local · +05:30");
    expect(r.footnote).toContain("Open-Meteo");
  });

  it("falls back to labelled illustrative data when the service failed", () => {
    const r = sampleReading(null, true);
    expect(r.state).toBe("failed");
    expect(r.value).toBe(DEMO_SAMPLE.aqi.value);
    expect(r.status).toBe("Live service unreachable");
    expect(r.footnote).toMatch(/Not a real reading/);
  });

  it("never presents backend demo data as live", () => {
    expect(sampleReading(snapshot({ is_demo: true }), false).state).toBe("loading");
    expect(sampleReading(snapshot({ is_demo: true }), true).state).toBe("failed");
  });

  it("shows placeholders while loading", () => {
    const r = sampleReading(null, false);
    expect(r).toMatchObject({ state: "loading", value: null, pollutants: null, status: "Connecting to live data…" });
  });
});
