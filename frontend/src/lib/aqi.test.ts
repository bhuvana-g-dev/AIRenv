import { describe, expect, it } from "vitest";
import { categoryForAqi, categoryForPm25, colorForAqi } from "./aqi";
import { fmtNum, pct, timeAgo, windDirection } from "./format";

describe("aqi helpers", () => {
  it("maps NAQI values to CPCB categories", () => {
    expect(categoryForAqi(0)?.key).toBe("good");
    expect(categoryForAqi(100)?.key).toBe("satisfactory");
    expect(categoryForAqi(201)?.key).toBe("poor");
    expect(categoryForAqi(450)?.key).toBe("severe");
    expect(categoryForAqi(null)).toBeNull();
  });
  it("maps PM2.5 concentrations to bands", () => {
    expect(categoryForPm25(25)?.key).toBe("good");
    expect(categoryForPm25(95)?.key).toBe("poor");
    expect(categoryForPm25(300)?.key).toBe("severe");
  });
  it("uses a neutral colour for missing data", () => {
    expect(colorForAqi(undefined)).toBe("#5F7469");
  });
});

describe("format helpers", () => {
  it("formats numbers and percentages", () => {
    expect(fmtNum(null)).toBe("—");
    expect(pct(12.4)).toBe("+12%");
    expect(pct(-5)).toBe("-5%");
  });
  it("describes relative time", () => {
    const now = Date.parse("2026-11-19T12:00:00Z");
    expect(timeAgo("2026-11-19T11:30:00Z", now)).toBe("30 min ago");
    expect(timeAgo(null, now)).toBe("unknown time");
  });
  it("converts wind degrees to compass", () => {
    expect(windDirection(0)).toBe("N");
    expect(windDirection(270)).toBe("W");
  });
});
