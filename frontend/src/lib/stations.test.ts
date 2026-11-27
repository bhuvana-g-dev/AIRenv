import { describe, expect, it } from "vitest";
import { differenceFromModelPct, markerSpec, pointLocation, readingLabel, stationKindLabel, stationLabel } from "./stations";
import type { Station } from "./types";

const station = (over: Partial<Station> = {}) =>
  ({
    id: "s1",
    name: "Anand Vihar",
    station_type: "reference",
    distance_km: 4.2,
    aqi: { value: 312, dominant_pollutant: "pm2_5", category: null },
    ...over,
  }) as Station;

describe("station labels", () => {
  it("names the station, its NAQI band, kind and distance", () => {
    expect(stationLabel(station())).toBe("Anand Vihar: NAQI 312 (Very Poor), reference monitor, 4.2 km");
  });

  it("handles missing AQI and low-cost sensors", () => {
    const s = station({ station_type: "low_cost", aqi: { value: null, dominant_pollutant: null, category: null } });
    expect(stationLabel(s)).toBe("Anand Vihar: NAQI unavailable, low-cost sensor, 4.2 km");
    expect(stationKindLabel("low_cost")).toBe("low-cost sensor");
  });

  it("formats reading keys", () => {
    expect(readingLabel("pm2_5")).toBe("PM2.5");
    expect(readingLabel("no2")).toBe("NO2");
  });
});

describe("markerSpec", () => {
  it("draws the model estimate as a larger dashed ring", () => {
    const m = markerSpec("#FF0000", "model");
    expect(m.size).toBe(22);
    expect(m.html).toContain("dashed #FF0000");
  });

  it("enlarges the selected station and rotates low-cost sensors", () => {
    expect(markerSpec("#00FF00", "reference", true).size).toBe(20);
    expect(markerSpec("#00FF00", "reference").size).toBe(16);
    expect(markerSpec("#00FF00", "low_cost").html).toContain("rotate(45deg)");
  });
});

describe("differenceFromModelPct", () => {
  it("is positive when the station reads higher than the model", () => {
    expect(differenceFromModelPct(120, 100)).toBe(20);
    expect(differenceFromModelPct(50, 100)).toBe(-50);
  });
});

describe("pointLocation", () => {
  it("builds a rounded id and readable name", () => {
    expect(pointLocation(28.61394, 77.20902)).toEqual({ id: "28.61_77.21", name: "Point 28.614, 77.209", lat: 28.61394, lon: 77.20902 });
  });
});
