import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, locQuery, patch, post } from "./api";
import { useApp } from "./store";
import type {
  AssistantReply,
  Briefing,
  Bundle,
  CommunityDetail,
  Community,
  FeedItem,
  HistoryResponse,
  NotificationItem,
  Profile,
  StationsResponse,
  SystemStatus,
} from "./types";

export function useLocationQuery() {
  const location = useApp((s) => s.location);
  const demo = useApp((s) => s.demo);
  return { location, demo, qs: locQuery(location, demo) };
}

export function useBundle() {
  const { location, demo, qs } = useLocationQuery();
  return useQuery({
    queryKey: ["bundle", location.lat, location.lon, demo],
    queryFn: () => api<Bundle>(`/api/air/bundle?${qs}`),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: 1,
  });
}

export function useBriefing(enabled = true) {
  const { location, demo, qs } = useLocationQuery();
  return useQuery({
    queryKey: ["briefing", location.lat, location.lon, demo],
    queryFn: () => api<Briefing>(`/api/insights/briefing?${qs}`, { timeoutMs: 40000 }),
    staleTime: 10 * 60_000,
    enabled,
    retry: 0,
  });
}

export function useHistory() {
  const { location, demo, qs } = useLocationQuery();
  return useQuery({
    queryKey: ["history", location.lat, location.lon, demo],
    queryFn: () => api<HistoryResponse>(`/api/air/history?${qs}`),
    staleTime: 10 * 60_000,
  });
}

export function useFeed() {
  const { location, qs } = useLocationQuery();
  return useQuery({
    queryKey: ["feed", location.lat, location.lon],
    queryFn: () => api<{ items: FeedItem[]; location_id: string }>(`/api/feed?${qs}`),
    staleTime: 60_000,
  });
}

export function useStations(lat: number, lon: number, radius: number) {
  return useQuery({
    queryKey: ["stations", lat.toFixed(3), lon.toFixed(3), radius],
    queryFn: () => api<StationsResponse>(`/api/air/stations?lat=${lat}&lon=${lon}&radius_km=${radius}`, { timeoutMs: 40000 }),
    staleTime: 10 * 60_000,
  });
}

export function useRefresh() {
  const qc = useQueryClient();
  const { qs } = useLocationQuery();
  return useMutation({
    mutationFn: () => post<{ status: string; observed_at: string }>(`/api/air/refresh?${qs}`),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["bundle"] });
      void qc.invalidateQueries({ queryKey: ["feed"] });
      void qc.invalidateQueries({ queryKey: ["history"] });
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useProfile() {
  return useQuery({ queryKey: ["me"], queryFn: () => api<Profile>("/api/me"), staleTime: 5 * 60_000, retry: 0 });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Profile>) => patch<Profile>("/api/me", body),
    onSuccess: (p) => {
      qc.setQueryData(["me"], p);
      void qc.invalidateQueries({ queryKey: ["briefing"] });
    },
  });
}

export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<{ items: NotificationItem[]; unread: number }>("/api/notifications"),
    enabled,
    staleTime: 60_000,
    retry: 0,
  });
}

export function useSystemStatus() {
  return useQuery({ queryKey: ["system"], queryFn: () => api<SystemStatus>("/api/system/status"), staleTime: 60_000 });
}

export function useCommunities(enabled = true) {
  return useQuery({
    queryKey: ["communities"],
    queryFn: () => api<{ communities: Community[] }>("/api/communities"),
    enabled,
    retry: 0,
  });
}

export function useCommunityDetail(id: string | null) {
  return useQuery({
    queryKey: ["community", id],
    queryFn: () => api<CommunityDetail>(`/api/communities/${id}`),
    enabled: Boolean(id),
  });
}

export function useAssistant() {
  return useMutation({
    mutationFn: (body: { question: string; history: { role: string; content: string }[]; lat: number; lon: number; name: string; demo: boolean }) =>
      api<AssistantReply>("/api/assistant/chat", { method: "POST", body: JSON.stringify(body), timeoutMs: 45000 }),
  });
}
