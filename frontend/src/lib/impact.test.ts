import { describe, expect, it } from "vitest";
import {
  daytimeStartOptions,
  defaultPlannedStart,
  exposureAnnouncement,
  exposureBars,
  exposureForecastLabel,
  hasReduction,
  relativeWidthPct,
  windowEnd,
} from "./impact";

const hoursFrom = (day: string, from: number, count: number) =>
  Array.from({ length: count }, (_, i) => `${day}T${String(from + i).padStart(2, "0")}:00`);

describe("daytimeStartOptions", () => {
  it("keeps only 05:00–21:00 slots from now onwards", () => {
    const times = hoursFrom("2025-01-10", 0, 24);
    expect(daytimeStartOptions({ times, now_index: 3 })).toEqual(times.slice(5, 22));
  });

  it("is empty without a series", () => {
    expect(daytimeStartOptions(undefined)).toEqual([]);
  });
});

describe("defaultPlannedStart", () => {
  it("prefers 08:00 and falls back to the first option", () => {
    expect(defaultPlannedStart(["2025-01-10T06:00", "2025-01-10T08:00"])).toBe("2025-01-10T08:00");
    expect(defaultPlannedStart(["2025-01-10T06:00", "2025-01-10T07:00"])).toBe("2025-01-10T06:00");
    expect(defaultPlannedStart([])).toBeUndefined();
  });
});

describe("windowEnd", () => {
  const forecast = hoursFrom("2025-01-10", 6, 4).map((time) => ({ time }));

  it("returns the hour the activity ends", () => {
    expect(windowEnd(forecast, "2025-01-10T06:00", 2)).toBe("2025-01-10T08:00");
  });

  it("clamps to the last forecast hour", () => {
    expect(windowEnd(forecast, "2025-01-10T08:00", 4)).toBe("2025-01-10T09:00");
  });
});

describe("exposure summaries", () => {
  const result = {
    planned: { start: "2025-01-10T08:00", mean_pm2_5: 120, inhaled_ug: 96 },
    best: { start: "2025-01-10T14:00", mean_pm2_5: 60, inhaled_ug: 48 },
    reduction_pct: 50,
    forecast: [{ time: "a" }, { time: "b" }],
  };

  it("describes the chart windows", () => {
    const label = exposureForecastLabel(result);
    expect(label).toMatch(/^Forecast PM2\.5 for the next 2 hours; planned window from \w{3} 08:00 averages 120 µg\/m³/);
    expect(label).toMatch(/cleanest window from \w{3} 14:00 averages 60 µg\/m³\.$/);
  });

  it("announces the reduction only when there is one", () => {
    expect(exposureAnnouncement(result)).toBe(
      "Estimated inhaled PM2.5: 96 µg at the planned time, 48 µg at the cleanest window, a 50% reduction.",
    );
    expect(exposureAnnouncement({ ...result, reduction_pct: 0 })).not.toContain("reduction");
    expect(hasReduction({ reduction_pct: null })).toBe(false);
  });

  it("builds comparison bars only when both windows exist", () => {
    expect(exposureBars(result).map((b) => [b.name, b.v])).toEqual([
      ["Planned", 96],
      ["Best window", 48],
    ]);
    expect(exposureBars({ ...result, best: null })).toEqual([]);
  });
});

describe("relativeWidthPct", () => {
  it("scales against the larger value and survives zeros", () => {
    expect(relativeWidthPct(5, 10, 5)).toBe(50);
    expect(relativeWidthPct(0, 0, 0)).toBe(0);
  });
});
