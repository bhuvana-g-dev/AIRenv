import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { motion } from "motion/react";
import { AlertCircle, CheckCircle2, Crosshair, Flame, Layers, MapPin, Radio, Satellite } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { LocationSearch } from "../components/LocationPicker";
import { currentPosition } from "../lib/locationSearch";
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, Skeleton, Tabs } from "../components/ui";
import { categoryForAqi, colorForAqi } from "../lib/aqi";
import { readableTextOn } from "../lib/contrast";
import { absoluteTime, fmtNum, timeAgo } from "../lib/format";
import { useBundle, useHistory, useProfile, useStations, useUpdateProfile } from "../lib/queries";
import { useApp, useToasts } from "../lib/store";
import type { Location, Station } from "../lib/types";
import { cn } from "../lib/cn";

function markerIcon(color: string, kind: "reference" | "low_cost" | "model", selected = false) {
  const size = kind === "model" ? 22 : selected ? 20 : 16;
  const shape = kind === "low_cost" ? "border-radius:4px;transform:rotate(45deg);" : "border-radius:9999px;";
  const inner =
    kind === "model"
      ? `<div style="width:${size}px;height:${size}px;border-radius:9999px;border:2px dashed ${color};background:${color}33;"></div>`
      : `<div style="width:${size}px;height:${size}px;${shape}background:${color};border:2px solid #07110E;box-shadow:0 0 12px ${color}aa;"></div>`;
  return L.divIcon({
    className: "airenv-marker",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<span class="ring" style="background:${color}55"></span>${inner}`,
  });
}

const SELECTED_STATION_ID = "selected-station-details";

function stationName(s: Station) {
  const cat = categoryForAqi(s.aqi.value)?.label;
  return `${s.name}: NAQI ${s.aqi.value ?? "unavailable"}${cat ? ` (${cat})` : ""}, ${s.station_type === "reference" ? "reference monitor" : "low-cost sensor"}, ${s.distance_km} km`;
}

function FlyTo({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lon], Math.max(map.getZoom(), 10), { duration: 1.2 });
  }, [lat, lon, map]);
  return null;
}

function ClickToSelect({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

// Standard OpenStreetMap tiles. "Dark" applies a CSS filter to the tile pane only (markers keep true colours).
const OSM_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function StationPopup({ s, modelPm }: { s: Station; modelPm: number | null }) {
  const pm = s.readings.pm2_5?.value;
  return (
    <div className="min-w-[220px] text-xs">
      <div className="font-semibold text-[13px] text-ink">{s.name}</div>
      <div className="mt-0.5 text-muted">
        {s.provider} · {s.station_type === "reference" ? "reference monitor" : "low-cost sensor"} · {s.distance_km} km
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {Object.entries(s.readings).map(([k, r]) => (
          <div key={k} className="rounded-md bg-black/30 px-2 py-1">
            <span className="text-faint">{k.toUpperCase().replace("_", ".")}</span> <b className="text-ink">{r!.value}</b> <span className="text-faint">{r!.unit}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 text-faint">Observed {absoluteTime(s.observed_at)} ({timeAgo(s.observed_at)})</div>
      {pm != null && modelPm != null && (
        <div className="mt-1 text-faint">
          vs model estimate at your location: {fmtNum(modelPm)} µg/m³ ({pm > modelPm ? "+" : ""}
          {fmtNum(((pm - modelPm) / modelPm) * 100)}%)
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

export default function AirMap() {
  const location = useApp((s) => s.location);
  const setLocation = useApp((s) => s.setLocation);
  const profile = useProfile();
  const update = useUpdateProfile();
  const push = useToasts((s) => s.push);
  const [radius, setRadius] = useState<"10" | "25" | "50">("25");
  const [tiles, setTiles] = useState<"dark" | "osm">("dark");
  const [selected, setSelected] = useState<string | null>(null);
  const bundle = useBundle();
  const history = useHistory();
  const stations = useStations(location.lat, location.lon, Number(radius));
  const modelPm = bundle.data?.snapshot.pollutants.pm2_5.value ?? null;

  const choose = (l: Location) => {
    setLocation(l, true);
    if (profile.data) update.mutate({ location: l });
  };

  const sorted = useMemo(() => stations.data?.stations ?? [], [stations.data]);
  const hotspotIds = new Set(stations.data?.hotspots.map((h) => h.station_id));
  const selectedStation = sorted.find((s) => s.id === selected) ?? null;

  return (
    <div>
      <PageHeader
        eyebrow="Air map"
        title="Monitoring stations & model estimate"
        description="Stations are shown only where a provider reports them. Values are never interpolated between stations."
        actions={
          <>
            <Tabs label="Map style" layoutId="tiles" value={tiles} onChange={setTiles} tabs={[{ value: "dark", label: "Dark" }, { value: "osm", label: "OSM" }]} />
            <Button
              variant="outline"
              size="sm"
              icon={<Crosshair aria-hidden="true" className="h-3.5 w-3.5" />}
              onClick={async () => {
                try {
                  choose(await currentPosition());
                } catch (e) {
                  push({ title: "Location unavailable", message: (e as Error).message, tone: "warning" });
                }
              }}
            >
              My location
            </Button>
          </>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <motion.div
          role="region"
          aria-label={`Interactive air-quality map around ${location.name}. Station details are also listed in "Nearby stations".`}
          initial={{ opacity: 0, scale: 0.99 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass relative h-[62vh] min-h-[460px] overflow-hidden rounded-2xl"
        >
          <MapContainer center={[location.lat, location.lon]} zoom={10} className="h-full w-full" zoomControl keyboard>
            <TileLayer key={tiles} url={OSM_URL} attribution={OSM_ATTR} maxZoom={19} className={tiles === "dark" ? "tiles-dark" : undefined} />
            <FlyTo lat={location.lat} lon={location.lon} />
            <ClickToSelect onPick={(lat, lon) => choose({ id: `${lat.toFixed(2)}_${lon.toFixed(2)}`, name: `Point ${lat.toFixed(3)}, ${lon.toFixed(3)}`, lat, lon })} />
            <Circle center={[location.lat, location.lon]} radius={Number(radius) * 1000} pathOptions={{ color: "#55D6E8", weight: 1, opacity: 0.35, fillOpacity: 0.03, dashArray: "4 6" }} />
            {bundle.data && (
              <Marker
                position={[location.lat, location.lon]}
                icon={markerIcon(colorForAqi(bundle.data.snapshot.aqi.value), "model")}
                title={`Model estimate at ${location.name}: NAQI ${bundle.data.snapshot.aqi.value ?? "unavailable"}`}
                alt={`Model estimate at ${location.name}`}
              >
                <Popup>
                  <div className="min-w-[200px] text-xs">
                    <div className="text-[13px] font-semibold text-ink">{location.name}</div>
                    <div className="mt-0.5 text-muted">Model grid estimate (CAMS) · not a monitor</div>
                    <div className="mt-2">
                      Estimated NAQI <b className="text-ink">{bundle.data.snapshot.aqi.value}</b> · PM2.5 <b className="text-ink">{fmtNum(modelPm)}</b> µg/m³
                    </div>
                    <div className="mt-1 text-faint">Observed {bundle.data.snapshot.observed_local?.replace("T", " ")}</div>
                  </div>
                </Popup>
              </Marker>
            )}
            {sorted.map((s) => (
              <Marker
                key={s.id}
                position={[s.lat, s.lon]}
                icon={markerIcon(colorForAqi(s.aqi.value), s.station_type, selected === s.id)}
                title={stationName(s)}
                alt={stationName(s)}
                eventHandlers={{ click: () => setSelected(s.id) }}
              >
                <Popup>
                  <StationPopup s={s} modelPm={modelPm} />
                </Popup>
              </Marker>
            ))}
          </MapContainer>
          <div className="pointer-events-none absolute bottom-3 left-3 z-[400] flex flex-wrap gap-2 rounded-xl border hairline bg-bg/80 px-3 py-2 text-[10px] text-muted backdrop-blur">
            <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-mint" /> reference monitor</span>
            <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-mint" /> low-cost sensor</span>
            <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-3 rounded-full border-2 border-dashed border-mint" /> model estimate</span>
            <span>colour = CPCB sub-index of reported values · click map to select a point (or search a location)</span>
          </div>
          <div role="status" className={cn("absolute right-3 top-3 z-[400] rounded-full border hairline bg-bg/80 px-3 py-1 text-[11px] text-muted backdrop-blur", !stations.isFetching && "sr-only")}>
            {stations.isFetching ? "Loading stations…" : ""}
          </div>
        </motion.div>

        <div className="space-y-4">
          <Card hover={false}>
            <CardHeader icon={<MapPin aria-hidden="true" className="h-4 w-4" />} title="Location" subtitle={`${location.name} · ${location.lat.toFixed(3)}, ${location.lon.toFixed(3)}`} />
            <LocationSearch onSelect={choose} />
          </Card>

          <Card hover={false}>
            <CardHeader icon={<Layers aria-hidden="true" className="h-4 w-4" />} title="Data providers" action={<Tabs label="Search radius" layoutId="radius" value={radius} onChange={setRadius} tabs={[{ value: "10", label: "10 km" }, { value: "25", label: "25 km" }, { value: "50", label: "50 km" }]} />} />
            {stations.isLoading ? (
              <Skeleton className="h-24" label="Loading data providers…" />
            ) : (
              <ul className="space-y-2">
                {stations.data?.providers.map((p) => (
                  <li key={p.key} className="flex items-start gap-2.5 rounded-xl border hairline bg-black/15 p-2.5 text-xs">
                    {p.status === "ok" ? <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald" /> : <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" />}
                    <span className="min-w-0">
                      <span className="block font-medium">
                        <span className="sr-only">{p.status === "ok" ? "Available: " : "Not available: "}</span>
                        {p.name} {p.status === "ok" && <span className="text-muted">· {p.count} station{p.count === 1 ? "" : "s"}</span>}
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
            )}
            {stations.data && stations.data.hotspots.length > 0 && (
              <div className="mt-3 rounded-xl border border-orange-400/25 bg-orange-400/10 p-3 text-xs">
                <p className="flex items-center gap-1.5 font-medium text-orange-200">
                  <Flame aria-hidden="true" className="h-3.5 w-3.5" /> Potential hotspots
                </p>
                <ul className="mt-1 space-y-0.5 text-muted">
                  {stations.data.hotspots.map((h) => (
                    <li key={h.station_id}>
                      {h.name}: {h.pm2_5} µg/m³ ({h.ratio}× local median {h.local_median})
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-[10px] text-faint">{stations.data.hotspot_method}</p>
              </div>
            )}
          </Card>

          <Card hover={false}>
            <CardHeader icon={<Radio aria-hidden="true" className="h-4 w-4" />} title="Nearby stations" subtitle="Sorted by distance" />
            {stations.isLoading ? (
              <Skeleton className="h-32" label="Loading nearby stations…" />
            ) : sorted.length === 0 ? (
              <EmptyState
                title="No station data in range"
                description="No configured provider reported stations here. Add DATA_GOV_IN_API_KEY (CPCB) or OPENAQ_API_KEY on the backend to load official monitors. The model estimate is still available."
              />
            ) : (
              <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
                {sorted.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      aria-pressed={selected === s.id}
                      aria-controls={SELECTED_STATION_ID}
                      onClick={() => setSelected(s.id)}
                      className={cn("flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors", selected === s.id ? "border-mint/30 bg-emerald/10" : "hairline bg-black/10 hover:bg-white/5")}
                    >
                      <span
                        aria-hidden="true"
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg font-display text-xs font-semibold"
                        style={{ background: colorForAqi(s.aqi.value), color: readableTextOn(colorForAqi(s.aqi.value)) }}
                      >
                        {s.aqi.value ?? "—"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px]">{s.name}</span>
                        <span className="sr-only">, NAQI {s.aqi.value ?? "unavailable"}</span>
                        <span className="block text-[10px] text-faint">
                          {categoryForAqi(s.aqi.value)?.label ?? "No AQI"} · {s.provider} · {s.distance_km} km · {timeAgo(s.observed_at)}
                          {hotspotIds.has(s.id) && <span className="text-orange-300"> · hotspot</span>}
                        </span>
                      </span>
                      <Badge color={s.station_type === "reference" ? "#35D399" : "#FACC15"}>{s.station_type === "reference" ? "ref" : "low-cost"}</Badge>
                    </button>
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

          {history.data && (
            <Card hover={false}>
              <CardHeader title="Historical comparison" subtitle="Model PM2.5 at the selected point" />
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-xl border hairline bg-black/15 p-2">
                  <p className="text-[10px] text-muted">Now</p>
                  <p className="font-display text-lg font-semibold">{fmtNum(history.data.comparisons.current_pm2_5)}</p>
                </div>
                <div className="rounded-xl border hairline bg-black/15 p-2">
                  <p className="text-[10px] text-muted">Yesterday</p>
                  <p className="font-display text-lg font-semibold">{fmtNum(history.data.comparisons.vs_yesterday_same_hour.value)}</p>
                </div>
                <div className="rounded-xl border hairline bg-black/15 p-2">
                  <p className="text-[10px] text-muted">7-day mean</p>
                  <p className="font-display text-lg font-semibold">{fmtNum(history.data.comparisons.seven_day_mean)}</p>
                </div>
              </div>
              <p className="mt-2 text-[10px] text-faint">µg/m³ · {history.data.comparisons.basis}</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
