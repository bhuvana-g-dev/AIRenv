import { absoluteTime, fmtNum, timeAgo } from "../../lib/format";
import { differenceFromModelPct, readingLabel, stationKindLabel } from "../../lib/stations";
import type { Station } from "../../lib/types";

/** Station details: readings, observation time and comparison with the model estimate. */
export function StationPopup({ s, modelPm }: { s: Station; modelPm: number | null }) {
  const pm = s.readings.pm2_5?.value;
  return (
    <div className="min-w-[220px] text-xs">
      <div className="font-semibold text-[13px] text-ink">{s.name}</div>
      <div className="mt-0.5 text-muted">
        {s.provider} · {stationKindLabel(s.station_type)} · {s.distance_km} km
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {Object.entries(s.readings).map(([k, r]) => (
          <div key={k} className="rounded-md bg-black/30 px-2 py-1">
            <span className="text-faint">{readingLabel(k)}</span> <b className="text-ink">{r?.value}</b>{" "}
            <span className="text-faint">{r?.unit}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 text-faint">
        Observed {absoluteTime(s.observed_at)} ({timeAgo(s.observed_at)})
      </div>
      {pm != null && modelPm != null && (
        <div className="mt-1 text-faint">
          vs model estimate at your location: {fmtNum(modelPm)} µg/m³ ({pm > modelPm ? "+" : ""}
          {fmtNum(differenceFromModelPct(pm, modelPm))}%)
        </div>
      )}
      {s.url && (
        <a href={s.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-cyan">
          Open source <span aria-hidden="true">↗</span>
          <span className="sr-only"> for {s.name} (opens in a new tab)</span>
        </a>
      )}
    </div>
  );
}
