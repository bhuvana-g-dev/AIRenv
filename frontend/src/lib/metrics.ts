export type Metric = "aqi_in" | "pm2_5" | "pm10" | "no2" | "o3";

export const METRIC_LABEL: Record<Metric, { label: string; unit: string }> = {
  aqi_in: { label: "NAQI (estimated)", unit: "" },
  pm2_5: { label: "PM2.5", unit: "µg/m³" },
  pm10: { label: "PM10", unit: "µg/m³" },
  no2: { label: "NO₂", unit: "µg/m³" },
  o3: { label: "O₃", unit: "µg/m³" },
};
