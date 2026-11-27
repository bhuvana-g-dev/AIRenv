import { describe, expect, it } from "vitest";
import { dailySummary, hourProfileSummary, seriesSummary, trendSummary } from "./chartSummary";

describe("chart summaries for screen readers", () => {
  it("describes trend history, now and forecast peak", () => {
    const s = trendSummary({
      label: "NAQI (estimated)",
      unit: "",
      isAqi: true,
      nowValue: 180,
      points: [
        { t: "2026-01-10T10:00", value: 120, isForecast: false },
        { t: "2026-01-10T11:00", value: 180, isForecast: false },
        { t: "2026-01-10T12:00", value: 260, isForecast: true },
        { t: "2026-01-10T13:00", value: 90, isForecast: true },
      ],
    });
    expect(s).toContain("Now: 180 (Moderate).");
    expect(s).toContain("Past 2 hours ranged 120 to 180.");
    expect(s).toContain("peak 260 (Poor) at Sat 12:00");
    expect(s).toContain("lowest 90 at Sat 13:00");
  });

  it("includes units for concentration metrics and skips gaps", () => {
    const s = trendSummary({
      label: "PM2.5",
      unit: "µg/m³",
      isAqi: false,
      nowValue: null,
      points: [
        { t: "2026-01-10T10:00", value: null, isForecast: false },
        { t: "2026-01-10T11:00", value: 40, isForecast: false },
      ],
    });
    expect(s).toContain("ranged 40 to 40 µg/m³");
    expect(s).not.toContain("Now:");
    expect(s).not.toContain("Forecast");
  });

  it("reports missing data", () => {
    expect(trendSummary({ label: "PM10", unit: "µg/m³", isAqi: false, nowValue: null, points: [] })).toBe("PM10 chart: no data available.");
    expect(dailySummary([])).toMatch(/no data/);
    expect(hourProfileSummary([])).toMatch(/no data/);
    expect(seriesSummary("X", [{ label: "a", value: null }])).toBe("X: no data available.");
  });

  it("summarises daily bars and hour profile", () => {
    const daily = dailySummary([
      { date: "2026-01-08", pm2_5_mean: 80 },
      { date: "2026-01-09", pm2_5_mean: 120 },
      { date: "2026-01-10", pm2_5_mean: 60 },
    ]);
    expect(daily).toBe("Daily mean PM2.5 for 3 days from 2026-01-08 to 2026-01-10. Highest 120 µg/m³ on 2026-01-09; lowest 60 µg/m³ on 2026-01-10.");
    const hours = hourProfileSummary(
      [
        { hour: 6, pm2_5_mean: 140 },
        { hour: 14, pm2_5_mean: 55 },
      ],
      [14],
    );
    expect(hours).toContain("Highest at 6:00 (140 µg/m³); lowest at 14:00 (55 µg/m³).");
    expect(hours).toContain("Typically cleanest daytime hours: 14:00.");
  });

  it("lists generic series values", () => {
    expect(seriesSummary("Inhaled", [{ label: "Planned", value: 120 }, { label: "Best", value: 40 }], "µg")).toBe("Inhaled: Planned 120 µg; Best 40 µg.");
  });
});
