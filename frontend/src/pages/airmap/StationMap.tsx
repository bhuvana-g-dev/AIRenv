import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { motion } from "motion/react";
import { useEffect } from "react";
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { colorForAqi } from "../../lib/aqi";
import { cn } from "../../lib/cn";
import { fmtNum } from "../../lib/format";
import { markerSpec, pointLocation, stationLabel, type MarkerKind } from "../../lib/stations";
import type { Location, Snapshot, Station } from "../../lib/types";
import { MapLegend } from "./MapLegend";
import { StationPopup } from "./StationPopup";

// Standard OpenStreetMap tiles. "Dark" applies a CSS filter to the tile pane only (markers keep true colours).
const OSM_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export type TileStyle = "dark" | "osm";

function markerIcon(color: string, kind: MarkerKind, selected = false) {
  const { size, html } = markerSpec(color, kind, selected);
  return L.divIcon({ className: "airenv-marker", iconSize: [size, size], iconAnchor: [size / 2, size / 2], html });
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

function ModelMarker({ location, snapshot, modelPm }: { location: Location; snapshot: Snapshot; modelPm: number | null }) {
  return (
    <Marker
      position={[location.lat, location.lon]}
      icon={markerIcon(colorForAqi(snapshot.aqi.value), "model")}
      title={`Model estimate at ${location.name}: NAQI ${snapshot.aqi.value ?? "unavailable"}`}
      alt={`Model estimate at ${location.name}`}
    >
      <Popup>
        <div className="min-w-[200px] text-xs">
          <div className="text-[13px] font-semibold text-ink">{location.name}</div>
          <div className="mt-0.5 text-muted">Model grid estimate (CAMS) · not a monitor</div>
          <div className="mt-2">
            Estimated NAQI <b className="text-ink">{snapshot.aqi.value}</b> · PM2.5 <b className="text-ink">{fmtNum(modelPm)}</b> µg/m³
          </div>
          <div className="mt-1 text-faint">Observed {snapshot.observed_local?.replace("T", " ")}</div>
        </div>
      </Popup>
    </Marker>
  );
}

interface StationMapProps {
  location: Location;
  radiusKm: number;
  tiles: TileStyle;
  snapshot: Snapshot | undefined;
  stations: Station[];
  selected: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onPickLocation: (l: Location) => void;
}

export function StationMap({
  location,
  radiusKm,
  tiles,
  snapshot,
  stations,
  selected,
  loading,
  onSelect,
  onPickLocation,
}: StationMapProps) {
  const modelPm = snapshot?.pollutants.pm2_5.value ?? null;
  return (
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
        <ClickToSelect onPick={(lat, lon) => onPickLocation(pointLocation(lat, lon))} />
        <Circle
          center={[location.lat, location.lon]}
          radius={radiusKm * 1000}
          pathOptions={{ color: "#55D6E8", weight: 1, opacity: 0.35, fillOpacity: 0.03, dashArray: "4 6" }}
        />
        {snapshot && <ModelMarker location={location} snapshot={snapshot} modelPm={modelPm} />}
        {stations.map((s) => (
          <Marker
            key={s.id}
            position={[s.lat, s.lon]}
            icon={markerIcon(colorForAqi(s.aqi.value), s.station_type, selected === s.id)}
            title={stationLabel(s)}
            alt={stationLabel(s)}
            eventHandlers={{ click: () => onSelect(s.id) }}
          >
            <Popup>
              <StationPopup s={s} modelPm={modelPm} />
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      <MapLegend />
      <div
        role="status"
        className={cn(
          "absolute right-3 top-3 z-[400] rounded-full border hairline bg-bg/80 px-3 py-1 text-[11px] text-muted backdrop-blur",
          !loading && "sr-only",
        )}
      >
        {loading ? "Loading stations…" : ""}
      </div>
    </motion.div>
  );
}
