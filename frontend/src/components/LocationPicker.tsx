import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Crosshair, Loader2, MapPin, Search } from "lucide-react";
import { api } from "../lib/api";
import type { Location } from "../lib/types";
import { Button, Modal } from "./ui";

export function useLocationSearch(query: string) {
  const [results, setResults] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await api<{ results: Location[] }>(`/api/locations/search?q=${encodeURIComponent(query.trim())}`, { signal: ctrl.signal });
        setResults(r.results);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);
  return { results, loading, error };
}

export async function currentPosition(): Promise<Location> {
  const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) reject(new Error("Geolocation is not supported by this browser."));
    navigator.geolocation.getCurrentPosition(resolve, (e) => reject(new Error(e.code === 1 ? "Location permission was denied." : "Could not determine your location.")), {
      enableHighAccuracy: false,
      timeout: 12000,
      maximumAge: 300000,
    });
  });
  const { latitude, longitude } = pos.coords;
  try {
    return await api<Location>(`/api/locations/reverse?lat=${latitude}&lon=${longitude}`);
  } catch {
    return { id: `${latitude.toFixed(2)}_${longitude.toFixed(2)}`, name: "My location", lat: latitude, lon: longitude };
  }
}

export function LocationSearch({ onSelect, autoFocus }: { onSelect: (l: Location) => void; autoFocus?: boolean }) {
  const [q, setQ] = useState("");
  const { results, loading, error } = useLocationSearch(q);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <input autoFocus={autoFocus} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a city, locality or campus area…" className="input pl-9" aria-label="Search location" />
        {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted" />}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="mt-3"
        loading={geoBusy}
        icon={<Crosshair className="h-3.5 w-3.5" />}
        onClick={async () => {
          setGeoBusy(true);
          setGeoErr(null);
          try {
            onSelect(await currentPosition());
          } catch (e) {
            setGeoErr((e as Error).message);
          } finally {
            setGeoBusy(false);
          }
        }}
      >
        Use my current location
      </Button>
      {geoErr && <p className="mt-2 text-xs text-orange-300">{geoErr}</p>}
      {error && <p className="mt-2 text-xs text-orange-300">{error}</p>}
      <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto">
        {results.map((r, i) => (
          <motion.li key={r.id + r.name} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
            <button onClick={() => onSelect(r)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white/5">
              <MapPin className="h-4 w-4 text-mint" />
              <span>
                <span className="block text-sm">{r.name}</span>
                <span className="block text-[11px] text-muted">{[r.admin1, r.country].filter(Boolean).join(", ")} · {r.lat.toFixed(2)}, {r.lon.toFixed(2)}</span>
              </span>
            </button>
          </motion.li>
        ))}
        {q.length >= 2 && !loading && results.length === 0 && !error && <li className="px-3 py-2 text-xs text-muted">No places found.</li>}
      </ul>
    </div>
  );
}

export function LocationModal({ open, onClose, onSelect }: { open: boolean; onClose: () => void; onSelect: (l: Location) => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Choose location">
      <LocationSearch
        autoFocus
        onSelect={(l) => {
          onSelect(l);
          onClose();
        }}
      />
      <p className="mt-4 text-[11px] text-faint">Place search by Open-Meteo Geocoding. Current location uses your browser's permission prompt and is reverse-geocoded with OpenStreetMap Nominatim.</p>
    </Modal>
  );
}
