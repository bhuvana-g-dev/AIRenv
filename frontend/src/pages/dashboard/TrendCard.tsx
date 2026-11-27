import { Activity } from "lucide-react";
import { useState } from "react";
import { TrendChart } from "../../components/charts";
import { Card, CardHeader, Tabs } from "../../components/ui";
import { METRIC_LABEL, type Metric } from "../../lib/metrics";
import type { Series } from "../../lib/types";

type Range = "near" | "week";

const METRIC_TABS: { value: Metric; label: string }[] = [
  { value: "aqi_in", label: "NAQI" },
  { value: "pm2_5", label: "PM2.5" },
  { value: "pm10", label: "PM10" },
  { value: "no2", label: "NO₂" },
];

const RANGE_TABS: { value: Range; label: string }[] = [
  { value: "near", label: "48h + 3d" },
  { value: "week", label: "7 days" },
];

/** Hours of history and forecast shown for each range option. */
const RANGE_HOURS: Record<Range, { past: number; future: number }> = {
  near: { past: 48, future: 72 },
  week: { past: 24 * 7, future: 24 },
};

export function TrendCard({ series }: { series: Series }) {
  const [metric, setMetric] = useState<Metric>("aqi_in");
  const [range, setRange] = useState<Range>("near");
  return (
    <Card delay={0.2} className="lg:col-span-3">
      <CardHeader
        icon={<Activity aria-hidden="true" className="h-4 w-4" />}
        title="Pollution trend & forecast"
        subtitle={<>Solid: model history · dashed violet: model forecast (uncertain) · {METRIC_LABEL[metric].label}</>}
        action={
          <div className="flex flex-wrap justify-end gap-2">
            <Tabs label="Chart metric" layoutId="metric" value={metric} onChange={setMetric} tabs={METRIC_TABS} />
            <Tabs label="Time range" layoutId="range" value={range} onChange={setRange} tabs={RANGE_TABS} />
          </div>
        }
      />
      <TrendChart
        series={series}
        metric={metric}
        pastHours={RANGE_HOURS[range].past}
        futureHours={RANGE_HOURS[range].future}
        height={300}
      />
    </Card>
  );
}
