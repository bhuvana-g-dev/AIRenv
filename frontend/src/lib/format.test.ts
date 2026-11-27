import { describe, expect, it } from "vitest";
import { CATEGORY_COLORS, CATEGORY_TEXT_COLORS, NAQI_BANDS, categoryForAqi, categoryForPm25, colorForAqi, colorForPm25, textColorForAqi } from "./aqi";
import { absoluteTime, fmtNum, localDate, localDayHour, localHour, pct, timeAgo, windDirection } from "./format";

describe("format edge cases", () => {
  it("fmtNum handles NaN, undefined and rounding", () => {
    expect(fmtNum(Number.NaN)).toBe("—");
    expect(fmtNum(undefined)).toBe("—");
    expect(fmtNum(12.345, 1)).toBe("12.3");
    expect(fmtNum(0)).toBe("0");
    expect(fmtNum(123456)).toBe("1,23,456"); // en-IN grouping
  });

  it("timeAgo covers every unit and bad input", () => {
    const now = Date.parse("2026-01-10T12:00:00Z");
    expect(timeAgo("2026-01-10T11:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-01-10T13:00:00Z", now)).toBe("just now"); // future clamps to 0
    expect(timeAgo("2026-01-10T09:00:00Z", now)).toBe("3 h ago");
    expect(timeAgo("2026-01-07T12:00:00Z", now)).toBe("3 d ago");
    expect(timeAgo("not a date", now)).toBe("unknown time");
    expect(timeAgo(undefined, now)).toBe("unknown time");
  });

  it("local time helpers read the API's local ISO strings", () => {
    expect(localHour("2026-01-10T07:30")).toBe("07:30");
    expect(localHour(null)).toBe("—");
    expect(localDayHour("2026-01-10T07:30")).toBe("Sat 07:30");
    expect(localDayHour(undefined)).toBe("—");
    expect(localDate("2026-01-10T00:00")).toMatch(/Sat/);
    expect(absoluteTime(null)).toBe("—");
    expect(absoluteTime("2026-01-10T07:30:00Z")).toMatch(/Jan/);
  });

  it("windDirection wraps around and pct handles missing values", () => {
    expect(windDirection(359)).toBe("N");
    expect(windDirection(135)).toBe("SE");
    expect(windDirection(null)).toBe("");
    expect(pct(null)).toBe("—");
    expect(pct(0)).toBe("0%");
  });
});

describe("aqi edge cases", () => {
  it("uses inclusive upper band limits", () => {
    expect(categoryForAqi(50)?.key).toBe("good");
    expect(categoryForAqi(51)?.key).toBe("satisfactory");
    expect(categoryForAqi(200)?.key).toBe("moderate");
    expect(categoryForAqi(400)?.key).toBe("very_poor");
  });

  it("clamps values above the scale to severe and ignores NaN", () => {
    expect(categoryForAqi(900)?.key).toBe("severe");
    expect(categoryForAqi(Number.NaN)).toBeNull();
  });

  it("maps PM2.5 band edges", () => {
    expect(categoryForPm25(30)?.key).toBe("good");
    expect(categoryForPm25(30.1)?.key).toBe("satisfactory");
    expect(categoryForPm25(250)?.key).toBe("very_poor");
    expect(categoryForPm25(null)).toBeNull();
    expect(colorForPm25(10)).toBe(CATEGORY_COLORS.good);
    expect(colorForPm25(undefined)).toBe("#5F7469");
  });

  it("every band has a colour and a text label (colour is never the only signal)", () => {
    for (const b of NAQI_BANDS) {
      expect(CATEGORY_COLORS[b.key]).toMatch(/^#[0-9A-F]{6}$/i);
      expect(b.label.length).toBeGreaterThan(0);
      expect(colorForAqi(b.max)).toBe(CATEGORY_COLORS[b.key]);
    }
  });

  it("provides a lighter text colour only for severe", () => {
    expect(CATEGORY_TEXT_COLORS.poor).toBe(CATEGORY_COLORS.poor);
    expect(CATEGORY_TEXT_COLORS.severe).not.toBe(CATEGORY_COLORS.severe);
    expect(textColorForAqi(450)).toBe(CATEGORY_TEXT_COLORS.severe);
    expect(textColorForAqi(null)).toBe("#869B90");
  });
});
