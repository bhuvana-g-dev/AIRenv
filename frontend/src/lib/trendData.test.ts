import { describe, expect, it } from "vitest";
import { trendPoints, trendTick, trendYMax } from "./trendData";
import type { Series } from "./types";

const times = Array.from({ length: 6 }, (_, h) => `2025-01-10T${String(h).padStart(2, "0")}:00`);
const series = { times, now_index: 2, hourly: { aqi_in: [10, 20, 30, 40, null, 60] } as Series["hourly"] };

describe("trendPoints", () => {
  it("splits observed and forecast at now, sharing the now point", () => {
    const pts = trendPoints(series, "aqi_in", 1, 2);
    expect(pts.map((p) => p.t)).toEqual(times.slice(1, 5));
    expect(pts.map((p) => p.observed)).toEqual([20, 30, null, null]);
    expect(pts.map((p) => p.forecast)).toEqual([null, 30, 40, null]);
    expect(pts.map((p) => p.isForecast)).toEqual([false, false, true, true]);
  });

  it("clamps the window to the series bounds", () => {
    expect(trendPoints(series, "aqi_in", 48, 72)).toHaveLength(6);
  });
});

describe("trendYMax", () => {
  const pts = (v: number) => [{ t: "", observed: v, forecast: null, value: v, isForecast: false }];
  it("rounds NAQI up to the next band step and caps at 500", () => {
    expect(trendYMax("aqi_in", pts(120))).toBe(150);
    expect(trendYMax("aqi_in", pts(490))).toBe(500);
  });
  it("adds 15 % headroom for concentrations", () => {
    expect(trendYMax("pm2_5", pts(100))).toBe(120);
  });
});

describe("trendTick", () => {
  it("shows the weekday at midnight and the time otherwise", () => {
    expect(trendTick("2025-01-10T00:00", () => "Friday 00:00")).toBe("Fri");
    expect(trendTick("2025-01-10T13:00", () => "x")).toBe("13:00");
  });
});
