import { Crosshair, MapPin } from "lucide-react";
import { useMemo, useState } from "react";
import { LocationSearch } from "../../components/LocationPicker";
import { Button, Card, CardHeader, PageHeader, Tabs } from "../../components/ui";
import { fmtNum } from "../../lib/format";
import { currentPosition } from "../../lib/locationSearch";
import { useBundle, useHistory, useStations } from "../../lib/queries";
import { useApp, useToasts } from "../../lib/store";
import { useSaveLocation } from "../../lib/useSaveLocation";
import { ProvidersCard, type RadiusKm } from "./ProvidersCard";
import { StationList } from "./StationList";
import { StationMap, type TileStyle } from "./StationMap";

const TILE_TABS: { value: TileStyle; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "osm", label: "OSM" },
];

function PointHistoryCard() {
  const history = useHistory();
  if (!history.data) return null;
  const c = history.data.comparisons;
  const tiles = [
    { label: "Now", value: c.current_pm2_5 },
    { label: "Yesterday", value: c.vs_yesterday_same_hour.value },
    { label: "7-day mean", value: c.seven_day_mean },
  ];
  return (
    <Card hover={false}>
      <CardHeader title="Historical comparison" subtitle="Model PM2.5 at the selected point" />
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border hairline bg-black/15 p-2">
            <p className="text-[10px] text-muted">{t.label}</p>
            <p className="font-display text-lg font-semibold">{fmtNum(t.value)}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-faint">µg/m³ · {c.basis}</p>
    </Card>
  );
}

export default function AirMapPage() {
  const location = useApp((s) => s.location);
  const push = useToasts((s) => s.push);
  const choose = useSaveLocation();
  const [radius, setRadius] = useState<RadiusKm>("25");
  const [tiles, setTiles] = useState<TileStyle>("dark");
  const [selected, setSelected] = useState<string | null>(null);
  const bundle = useBundle();
  const stations = useStations(location.lat, location.lon, Number(radius));
  const list = useMemo(() => stations.data?.stations ?? [], [stations.data]);
  const hotspotIds = useMemo(() => new Set(stations.data?.hotspots.map((h) => h.station_id)), [stations.data]);

  const locateMe = () =>
    currentPosition()
      .then(choose)
      .catch((e: Error) => push({ title: "Location unavailable", message: e.message, tone: "warning" }));

  return (
    <div>
      <PageHeader
        eyebrow="Air map"
        title="Monitoring stations & model estimate"
        description="Stations are shown only where a provider reports them. Values are never interpolated between stations."
        actions={
          <>
            <Tabs label="Map style" layoutId="tiles" value={tiles} onChange={setTiles} tabs={TILE_TABS} />
            <Button
              variant="outline"
              size="sm"
              icon={<Crosshair aria-hidden="true" className="h-3.5 w-3.5" />}
              onClick={() => void locateMe()}
            >
              My location
            </Button>
          </>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <StationMap
          location={location}
          radiusKm={Number(radius)}
          tiles={tiles}
          snapshot={bundle.data?.snapshot}
          stations={list}
          selected={selected}
          loading={stations.isFetching}
          onSelect={setSelected}
          onPickLocation={choose}
        />
        <div className="space-y-4">
          <Card hover={false}>
            <CardHeader
              icon={<MapPin aria-hidden="true" className="h-4 w-4" />}
              title="Location"
              subtitle={`${location.name} · ${location.lat.toFixed(3)}, ${location.lon.toFixed(3)}`}
            />
            <LocationSearch onSelect={choose} />
          </Card>
          <ProvidersCard data={stations.data} loading={stations.isLoading} radius={radius} onRadius={setRadius} />
          <StationList
            stations={list}
            hotspotIds={hotspotIds}
            selected={selected}
            loading={stations.isLoading}
            modelPm={bundle.data?.snapshot.pollutants.pm2_5.value ?? null}
            onSelect={setSelected}
          />
          <PointHistoryCard />
        </div>
      </div>
    </div>
  );
}
