import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { api, post } from "../../lib/api";
import { useApp } from "../../lib/store";
import type { CommunityImpact, EnergyInput, EnergyResult, ExposureParams, ExposureResult, Factors, TripInput, TripResult } from "./types";

const DEBOUNCE_MS = 250;

/**
 * Re-estimates exposure whenever the planned activity or location changes. A mutation (not a
 * query) because every estimate is a fresh POST and stale results must not be shown.
 */
export function useExposureEstimate(planned: string, hours: number, intensity: string) {
  const { lat, lon } = useApp((s) => s.location);
  const demo = useApp((s) => s.demo);
  const params = useMemo<ExposureParams | null>(
    () => (planned ? { lat, lon, activity_hours: hours, intensity, planned_start: planned, demo } : null),
    [planned, hours, intensity, lat, lon, demo],
  );
  const estimate = useMutation({ mutationFn: (body: ExposureParams) => post<ExposureResult>("/api/impact/exposure", body) });
  const { mutate } = estimate;
  useEffect(() => {
    if (params) mutate(params);
  }, [params, mutate]);
  return estimate;
}

/** POSTs `body` to `path` 250 ms after it last changed (typing in number inputs fires often). */
function useDebouncedEstimate<TBody, TResult>(path: string, body: TBody) {
  const estimate = useMutation({ mutationFn: (b: TBody) => post<TResult>(path, b) });
  const { mutate } = estimate;
  useEffect(() => {
    const id = setTimeout(() => mutate(body), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [body, mutate]);
  return estimate;
}

export const useTripEstimate = (trip: TripInput) => useDebouncedEstimate<TripInput, TripResult>("/api/impact/trip", trip);

export const useEnergyEstimate = (energy: EnergyInput) => useDebouncedEstimate<EnergyInput, EnergyResult>("/api/impact/energy", energy);

export function useEmissionFactors() {
  return useQuery({ queryKey: ["factors"], queryFn: () => api<Factors>("/api/impact/factors"), staleTime: Infinity });
}

export function useCommunityImpact() {
  return useQuery({ queryKey: ["impact-community"], queryFn: () => api<CommunityImpact>("/api/impact/community") });
}
