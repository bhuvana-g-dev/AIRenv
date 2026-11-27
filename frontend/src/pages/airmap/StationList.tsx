import { Radio } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, Skeleton } from "../../components/ui";
import { categoryForAqi, colorForAqi } from "../../lib/aqi";
import { cn } from "../../lib/cn";
import { readableTextOn } from "../../lib/contrast";
import { timeAgo } from "../../lib/format";
import type { Station } from "../../lib/types";
import { StationPopup } from "./StationPopup";

const SELECTED_STATION_ID = "selected-station-details";

function StationButton({ s, selected, hotspot, onSelect }: { s: Station; selected: boolean; hotspot: boolean; onSelect: () => void }) {
  const color = colorForAqi(s.aqi.value);
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-controls={SELECTED_STATION_ID}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors",
        selected ? "border-mint/30 bg-emerald/10" : "hairline bg-black/10 hover:bg-white/5",
      )}
    >
      <span
        aria-hidden="true"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg font-display text-xs font-semibold"
        style={{ background: color, color: readableTextOn(color) }}
      >
        {s.aqi.value ?? "—"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px]">{s.name}</span>
        <span className="sr-only">, NAQI {s.aqi.value ?? "unavailable"}</span>
        <span className="block text-[10px] text-faint">
          {categoryForAqi(s.aqi.value)?.label ?? "No AQI"} · {s.provider} · {s.distance_km} km · {timeAgo(s.observed_at)}
          {hotspot && <span className="text-orange-300"> · hotspot</span>}
        </span>
      </span>
      <Badge color={s.station_type === "reference" ? "#35D399" : "#FACC15"}>{s.station_type === "reference" ? "ref" : "low-cost"}</Badge>
    </button>
  );
}

export function StationList({
  stations,
  hotspotIds,
  selected,
  loading,
  modelPm,
  onSelect,
}: {
  stations: Station[];
  hotspotIds: Set<string>;
  selected: string | null;
  loading: boolean;
  modelPm: number | null;
  onSelect: (id: string) => void;
}) {
  const selectedStation = stations.find((s) => s.id === selected) ?? null;
  return (
    <Card hover={false}>
      <CardHeader icon={<Radio aria-hidden="true" className="h-4 w-4" />} title="Nearby stations" subtitle="Sorted by distance" />
      {loading ? (
        <Skeleton className="h-32" label="Loading nearby stations…" />
      ) : stations.length === 0 ? (
        <EmptyState
          title="No station data in range"
          description="No configured provider reported stations here. Add DATA_GOV_IN_API_KEY (CPCB) or OPENAQ_API_KEY on the backend to load official monitors. The model estimate is still available."
        />
      ) : (
        <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
          {stations.map((s) => (
            <li key={s.id}>
              <StationButton s={s} selected={selected === s.id} hotspot={hotspotIds.has(s.id)} onSelect={() => onSelect(s.id)} />
            </li>
          ))}
        </ul>
      )}
      {/* Keyboard / screen-reader equivalent of the marker popup. */}
      <div id={SELECTED_STATION_ID} aria-live="polite" className="mt-3">
        {selectedStation && (
          <div className="rounded-xl border border-mint/20 bg-black/20 p-3">
            <p className="label mb-1.5">Selected station</p>
            <StationPopup s={selectedStation} modelPm={modelPm} />
          </div>
        )}
      </div>
    </Card>
  );
}
