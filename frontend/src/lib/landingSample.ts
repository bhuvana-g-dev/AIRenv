import type { Category, Snapshot } from "./types";

export type SamplePollutants = Record<"pm2_5" | "pm10" | "no2", number | null>;

const DEMO_CATEGORY: Category = { key: "poor", label: "Poor", range: [201, 300], severity: 3, health: "" };

/** Illustrative values used only when the live API cannot be reached. Always labelled. */
export const DEMO_SAMPLE: { aqi: { value: number; category: Category }; pollutants: SamplePollutants } = {
  aqi: { value: 286, category: DEMO_CATEGORY },
  pollutants: { pm2_5: 118, pm10: 196, no2: 48 },
};

export type SampleState = "loading" | "live" | "failed";

export interface SampleReading {
  state: SampleState;
  place: string;
  value: number | null;
  category: Category | null;
  pollutants: SamplePollutants | null;
  status: string;
  footnote: string;
}

/**
 * What the landing-page sample card shows: the live reading when one arrived (and is not demo
 * data), the labelled illustration when the request failed, and placeholders while loading.
 */
export function sampleReading(snap: Snapshot | null, failed: boolean): SampleReading {
  if (snap && !snap.is_demo)
    return {
      state: "live",
      place: snap.location.name,
      value: snap.aqi.value,
      category: snap.aqi.category,
      pollutants: { pm2_5: snap.pollutants.pm2_5.value, pm10: snap.pollutants.pm10.value, no2: snap.pollutants.no2.value },
      status: `Observed ${snap.observed_local?.slice(11, 16)} local · ${snap.utc_offset}`,
      footnote: `Source: ${snap.sources.air.name}. Estimated Indian NAQI from CPCB breakpoints.`,
    };
  if (failed)
    return {
      state: "failed",
      place: "New Delhi",
      value: DEMO_SAMPLE.aqi.value,
      category: DEMO_SAMPLE.aqi.category,
      pollutants: DEMO_SAMPLE.pollutants,
      status: "Live service unreachable",
      footnote: "Illustrative values for demonstration only. Not a real reading.",
    };
  return {
    state: "loading",
    place: "New Delhi",
    value: null,
    category: null,
    pollutants: null,
    status: "Connecting to live data…",
    footnote: "\u00a0",
  };
}
