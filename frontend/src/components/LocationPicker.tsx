import { useId, useState } from "react";
import { motion } from "motion/react";
import { Crosshair, Loader2, MapPin, Search } from "lucide-react";
import { currentPosition, useLocationSearch } from "../lib/locationSearch";
import type { Location } from "../lib/types";
import { Button, Modal } from "./ui";

/** `initialFocus` marks the search box as the element a surrounding dialog focuses first. */
export function LocationSearch({ onSelect, initialFocus }: { onSelect: (l: Location) => void; initialFocus?: boolean }) {
  const [q, setQ] = useState("");
  const { results, loading, error } = useLocationSearch(q);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const id = useId();
  const resultsId = `${id}-results`;
  const statusId = `${id}-status`;
  const searching = q.trim().length >= 2;
  const status = !searching ? "" : loading ? "Searching…" : error ? "" : results.length === 0 ? "No places found." : `${results.length} place${results.length === 1 ? "" : "s"} found.`;
  return (
    <div>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <input
          type="search"
          data-autofocus={initialFocus || undefined}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a city, locality or campus area…"
          className="input pl-9"
          aria-label="Search location"
          aria-controls={resultsId}
          aria-describedby={statusId}
          autoComplete="off"
        />
        {loading && <Loader2 aria-hidden="true" className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted motion-safe:animate-spin" />}
      </div>
      <p id={statusId} role="status" className="sr-only">
        {status}
      </p>
      <Button
        variant="outline"
        size="sm"
        className="mt-3"
        loading={geoBusy}
        icon={<Crosshair aria-hidden="true" className="h-3.5 w-3.5" />}
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
      {geoErr && (
        <p role="alert" className="mt-2 text-xs text-orange-300">
          {geoErr}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-orange-300">
          {error}
        </p>
      )}
      <ul id={resultsId} aria-label="Location results" className="mt-3 max-h-72 space-y-1 overflow-y-auto">
        {results.map((r, i) => (
          <motion.li key={r.id + r.name} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
            <button type="button" onClick={() => onSelect(r)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white/5">
              <MapPin aria-hidden="true" className="h-4 w-4 text-mint" />
              <span>
                <span className="block text-sm">{r.name}</span>
                <span className="block text-[11px] text-muted">
                  {[r.admin1, r.country].filter(Boolean).join(", ")} · {r.lat.toFixed(2)}, {r.lon.toFixed(2)}
                </span>
              </span>
            </button>
          </motion.li>
        ))}
        {searching && !loading && results.length === 0 && !error && (
          <li className="px-3 py-2 text-xs text-muted" aria-hidden="true">
            No places found.
          </li>
        )}
      </ul>
    </div>
  );
}

export function LocationModal({ open, onClose, onSelect }: { open: boolean; onClose: () => void; onSelect: (l: Location) => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Choose location">
      <LocationSearch
        initialFocus
        onSelect={(l) => {
          onSelect(l);
          onClose();
        }}
      />
      <p className="mt-4 text-[11px] text-faint">
        Place search by Open-Meteo Geocoding. Current location uses your browser's permission prompt and is reverse-geocoded with OpenStreetMap Nominatim.
      </p>
    </Modal>
  );
}
