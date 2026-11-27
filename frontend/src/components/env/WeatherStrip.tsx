import { weatherItems } from "../../lib/envDisplay";
import type { Snapshot } from "../../lib/types";

export function WeatherStrip({ snapshot }: { snapshot: Snapshot }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {weatherItems(snapshot.weather).map((it) => (
        <div key={it.label} className="rounded-xl border hairline bg-black/15 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-muted">
            <it.icon aria-hidden="true" className="h-4 w-4" />
            <span className="text-[11px]">{it.label}</span>
          </div>
          <div className="mt-1 text-sm font-medium">{it.value}</div>
        </div>
      ))}
    </div>
  );
}
