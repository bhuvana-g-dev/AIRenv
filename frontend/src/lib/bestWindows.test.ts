import { describe, expect, it } from "vitest";
import { cleanerWindows, windowLabel } from "./bestWindows";
import type { Series } from "./types";

/** 24 hourly slots on one day starting at 00:00, with the given PM2.5 values. */
function series(pm: (number | null)[], nowIndex = 0) {
  const times = pm.map((_, h) => `2025-01-10T${String(h).padStart(2, "0")}:00`);
  return { times, now_index: nowIndex, hourly: { pm2_5: pm } as Series["hourly"] };
}

describe("cleanerWindows", () => {
  const pm = Array.from({ length: 24 }, (_, h) => 100 + h);

  it("only considers daytime windows that end by 21:00", () => {
    const { chosen, worst } = cleanerWindows(series(pm));
    expect(chosen.map((c) => c.i)).toEqual([6, 8, 10]);
    expect(worst?.i).toBe(19);
  });

  it("picks non-overlapping windows in order of cleanliness", () => {
    const dips = pm.map((v, h) => (h === 12 || h === 13 ? 20 : h === 14 ? 25 : v));
    const { chosen } = cleanerWindows(series(dips));
    expect(chosen[0]).toEqual({ i: 12, mean: 20 });
    expect(chosen.every((c, k) => chosen.slice(k + 1).every((o) => Math.abs(o.i - c.i) >= 2))).toBe(true);
  });

  it("skips windows with missing forecasts and starts from now", () => {
    const gaps = pm.map((v, h) => (h < 15 ? null : v));
    const { chosen } = cleanerWindows(series(gaps, 3));
    expect(chosen.map((c) => c.i)).toEqual([15, 17, 19]);
  });

  it("returns nothing when no daytime hours remain", () => {
    expect(cleanerWindows(series(pm, 22))).toEqual({ chosen: [], worst: null });
  });
});

describe("windowLabel", () => {
  it("formats the weekday and the two-hour span", () => {
    const { times } = series(Array.from({ length: 24 }, () => 1));
    expect(windowLabel(times, 14)).toMatch(/^\w{3} 14:00–16:00$/);
  });
});
