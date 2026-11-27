import { CloudSun, Gauge } from "lucide-react";
import { AqiGauge, PollutantGrid, WeatherStrip } from "../../components/env";
import { Card, CardHeader } from "../../components/ui";
import { CATEGORY_COLORS } from "../../lib/aqi";
import { fmtNum } from "../../lib/format";
import type { Snapshot } from "../../lib/types";

export function CurrentAirCard({ snapshot }: { snapshot: Snapshot }) {
  const cat = snapshot.aqi.category;
  return (
    <Card className="overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background: `radial-gradient(600px circle at 50% 0%, ${cat ? CATEGORY_COLORS[cat.key] : "#5F7469"}1f, transparent 60%)`,
        }}
      />
      <CardHeader
        icon={<Gauge aria-hidden="true" className="h-4 w-4" />}
        title="Current air quality"
        subtitle="Indian National AQI, estimated"
      />
      <div className="relative flex flex-col items-center">
        <AqiGauge value={snapshot.aqi.value} category={cat} />
        <p className="mt-3 text-center text-xs leading-relaxed text-muted">{cat?.health}</p>
        <p className="mt-1 text-[10px] text-faint">{snapshot.analysis.health_source}</p>
        <div className="mt-4 grid w-full grid-cols-2 gap-2 text-center">
          <div className="rounded-xl border hairline bg-black/15 p-2.5">
            <p className="text-[10px] text-muted">Main pollutant</p>
            <p className="text-sm font-semibold">{snapshot.aqi.dominant_label ?? "—"}</p>
          </div>
          <div className="rounded-xl border hairline bg-black/15 p-2.5" title="US EPA AQI from the provider, for reference">
            <p className="text-[10px] text-muted">US AQI (reference)</p>
            <p className="text-sm font-semibold">{fmtNum(snapshot.us_aqi)}</p>
          </div>
        </div>
        {snapshot.aqi.method_note && <p className="mt-3 text-[10px] leading-relaxed text-faint">{snapshot.aqi.method_note}</p>}
      </div>
    </Card>
  );
}

export function PollutantsCard({ snapshot }: { snapshot: Snapshot }) {
  return (
    <Card delay={0.05}>
      <CardHeader
        icon={<CloudSun aria-hidden="true" className="h-4 w-4" />}
        title="Pollutants & weather"
        subtitle="Current hourly values · bars show CPCB sub-index"
      />
      <PollutantGrid snapshot={snapshot} />
      <div className="mt-4">
        <WeatherStrip snapshot={snapshot} />
      </div>
      {snapshot.sources.weather && <p className="mt-2 text-[10px] text-faint">Weather: {snapshot.sources.weather.name}</p>}
    </Card>
  );
}
