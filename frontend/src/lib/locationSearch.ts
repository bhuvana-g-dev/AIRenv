import { useEffect, useState } from "react";
import { api } from "./api";
import type { Location } from "./types";

/** Debounced place search against the backend geocoder. Aborts superseded requests. */
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
        if ((e as Error).name !== "AbortError" && !ctrl.signal.aborted) setError((e as Error).message);
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

/** Browser geolocation, reverse-geocoded to a named place when the backend can resolve it. */
export async function currentPosition(): Promise<Location> {
  const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by this browser."));
      return;
    }
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
