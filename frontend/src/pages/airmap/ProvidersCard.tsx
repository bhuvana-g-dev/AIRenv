import { AlertCircle, CheckCircle2, Flame, Layers, Satellite } from "lucide-react";
import { Card, CardHeader, Skeleton, Tabs } from "../../components/ui";
import { plural } from "../../lib/format";
import type { StationsResponse } from "../../lib/types";

export type RadiusKm = "10" | "25" | "50";

const RADIUS_TABS: { value: RadiusKm; label: string }[] = [
  { value: "10", label: "10 km" },
  { value: "25", label: "25 km" },
  { value: "50", label: "50 km" },
];

function ProviderList({ providers }: { providers: StationsResponse["providers"] }) {
  return (
    <ul className="space-y-2">
      {providers.map((p) => (
        <li key={p.key} className="flex items-start gap-2.5 rounded-xl border hairline bg-black/15 p-2.5 text-xs">
          {p.status === "ok" ? (
            <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald" />
          ) : (
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" />
          )}
          <span className="min-w-0">
            <span className="block font-medium">
              <span className="sr-only">{p.status === "ok" ? "Available: " : "Not available: "}</span>
              {p.name} {p.status === "ok" && <span className="text-muted">· {plural(p.count, "station")}</span>}
            </span>
            {p.message && <span className="block text-muted">{p.message}</span>}
          </span>
        </li>
      ))}
      <li className="flex items-start gap-2.5 rounded-xl border hairline bg-black/15 p-2.5 text-xs">
        <Satellite aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-cyan" />
        <span>
          <span className="block font-medium">Open-Meteo CAMS model</span>
          <span className="block text-muted">Grid estimate at the selected point (dashed marker).</span>
        </span>
      </li>
    </ul>
  );
}

function Hotspots({ data }: { data: StationsResponse }) {
  return (
    <div className="mt-3 rounded-xl border border-orange-400/25 bg-orange-400/10 p-3 text-xs">
      <p className="flex items-center gap-1.5 font-medium text-orange-200">
        <Flame aria-hidden="true" className="h-3.5 w-3.5" /> Potential hotspots
      </p>
      <ul className="mt-1 space-y-0.5 text-muted">
        {data.hotspots.map((h) => (
          <li key={h.station_id}>
            {h.name}: {h.pm2_5} µg/m³ ({h.ratio}× local median {h.local_median})
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[10px] text-faint">{data.hotspot_method}</p>
    </div>
  );
}

export function ProvidersCard({
  data,
  loading,
  radius,
  onRadius,
}: {
  data: StationsResponse | undefined;
  loading: boolean;
  radius: RadiusKm;
  onRadius: (r: RadiusKm) => void;
}) {
  return (
    <Card hover={false}>
      <CardHeader
        icon={<Layers aria-hidden="true" className="h-4 w-4" />}
        title="Data providers"
        action={<Tabs label="Search radius" layoutId="radius" value={radius} onChange={onRadius} tabs={RADIUS_TABS} />}
      />
      {loading ? <Skeleton className="h-24" label="Loading data providers…" /> : <ProviderList providers={data?.providers ?? []} />}
      {data && data.hotspots.length > 0 && <Hotspots data={data} />}
    </Card>
  );
}
