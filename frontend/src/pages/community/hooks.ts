import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, del, patch, post } from "../../lib/api";
import { advisoryToastTitle, recordPayload, type RecordDraft } from "../../lib/community";
import { useApp, useToasts } from "../../lib/store";
import type { CommunityEvent, Location, Snapshot } from "../../lib/types";

/** Refetch the community list and every open community detail after a change. */
function useInvalidateCommunities() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["communities"] });
    void qc.invalidateQueries({ queryKey: ["community"] });
  };
}

/** `onError` handler that shows the failure as a danger toast. */
function useErrorToast() {
  const push = useToasts((s) => s.push);
  return (title: string) => (e: Error) => push({ title, message: e.message, tone: "danger" });
}

export function useCreateCommunity(onDone: () => void) {
  const invalidate = useInvalidateCommunities();
  const push = useToasts((s) => s.push);
  const onError = useErrorToast();
  return useMutation({
    mutationFn: (body: { name: string; type: string; location: Location }) => post("/api/communities", body),
    onSuccess: () => {
      invalidate();
      push({ title: "Community created", tone: "success" });
      onDone();
    },
    onError: onError("Could not create community"),
  });
}

export function useDemoCommunities(onRemoved: () => void) {
  const location = useApp((s) => s.location);
  const invalidate = useInvalidateCommunities();
  const push = useToasts((s) => s.push);
  const seed = useMutation({
    mutationFn: () => post(`/api/communities/demo/seed?lat=${location.lat}&lon=${location.lon}&name=${encodeURIComponent(location.name)}`),
    onSuccess: () => {
      invalidate();
      push({
        title: "Demo communities loaded",
        message: "Clearly labelled sample communities, assessed against the real forecast.",
        tone: "ai",
      });
    },
  });
  const unseed = useMutation({
    mutationFn: () => del("/api/communities/demo"),
    onSuccess: () => {
      onRemoved();
      invalidate();
    },
  });
  return { seed, unseed };
}

/** Approve (and send) or dismiss the pending advisory for an event. */
export function useAdvisoryDecision(cid: string, ev: CommunityEvent) {
  const invalidate = useInvalidateCommunities();
  const push = useToasts((s) => s.push);
  const onError = useErrorToast();
  return useMutation({
    mutationFn: ({ action, text }: { action: "approve" | "dismiss"; text: string }) =>
      post<CommunityEvent>(`/api/communities/${cid}/events/${ev.id}/advisory`, { action, text }),
    onSuccess: (res, { action }) => {
      invalidate();
      const errs = res.advisory?.delivery_errors ?? [];
      push({
        title: advisoryToastTitle(action, res.advisory?.status),
        message: errs.length ? errs.join("; ") : undefined,
        tone: action === "approve" ? "success" : "info",
      });
    },
    onError: onError("Action failed"),
  });
}

export function useDeleteEvent(cid: string, eventId: string) {
  const invalidate = useInvalidateCommunities();
  return useMutation({ mutationFn: () => del(`/api/communities/${cid}/events/${eventId}`), onSuccess: invalidate });
}

export interface EventDraft {
  title: string;
  activity_type: string;
  intensity: string;
  outdoor: boolean;
  date: string;
  time: string;
  duration_hours: number;
}

export function useAddEvent(cid: string, onDone: () => void) {
  const invalidate = useInvalidateCommunities();
  const push = useToasts((s) => s.push);
  const onError = useErrorToast();
  return useMutation({
    mutationFn: (body: EventDraft) => post<CommunityEvent>(`/api/communities/${cid}/events`, body),
    onSuccess: (ev) => {
      invalidate();
      onDone();
      push({ title: "Activity added", message: ev.risk?.summary, tone: ev.risk?.respond ? "warning" : "success" });
    },
    onError: onError("Could not add activity"),
  });
}

export function useInitiativeActions(cid: string) {
  const invalidate = useInvalidateCommunities();
  const onError = useErrorToast();
  const createInitiative = useMutation({
    mutationFn: (body: { type: string; title: string; description: string }) => post(`/api/communities/${cid}/initiatives`, body),
    onSuccess: invalidate,
    onError: onError("Could not add initiative"),
  });
  const createRecord = useMutation({
    mutationFn: ({ initiativeId, type, rec }: { initiativeId: string; type: string | undefined; rec: RecordDraft }) =>
      post(`/api/communities/${cid}/initiatives/${initiativeId}/records`, recordPayload(type, rec)),
    onSuccess: invalidate,
    onError: onError("Could not add record"),
  });
  const verify = useMutation({ mutationFn: (rid: string) => post(`/api/communities/${cid}/records/${rid}/verify`), onSuccess: invalidate });
  return { createInitiative, createRecord, verify };
}

export function useGroupActions(cid: string, onConnected: () => void) {
  const invalidate = useInvalidateCommunities();
  const push = useToasts((s) => s.push);
  const onError = useErrorToast();
  const connect = useMutation({
    mutationFn: (code: string) => post<{ group: string }>(`/api/communities/${cid}/groups/connect`, { code }),
    onSuccess: (r) => {
      invalidate();
      onConnected();
      push({ title: `Connected ${r.group}`, tone: "success" });
    },
    onError: onError("Could not connect group"),
  });
  const update = useMutation({
    mutationFn: ({ gid, body }: { gid: string; body: Record<string, unknown> }) => patch(`/api/communities/${cid}/groups/${gid}`, body),
    onSuccess: invalidate,
    onError: onError("Update failed"),
  });
  return { connect, update };
}

export interface ConversationAnalysis {
  relevant: boolean;
  respond: boolean;
  advisory: string | null;
  event: Record<string, unknown> | null;
  risk: CommunityEvent["risk"];
  privacy: string;
}

/** Dry-run of Conversation Intelligence on one message; nothing is stored server-side. */
export function useAnalyzeConversation() {
  return useMutation({
    mutationFn: (body: { text: string; lat: number; lon: number; audience: "school" | "general" }) =>
      post<ConversationAnalysis>("/api/conversation/analyze", body),
  });
}

/** Current air at a community's own location (which may differ from the user's). */
export function useCommunityAir(loc: Location) {
  return useQuery({
    queryKey: ["community-air", loc.lat, loc.lon],
    queryFn: () => api<Snapshot>(`/api/air/current?lat=${loc.lat}&lon=${loc.lon}&name=${encodeURIComponent(loc.name)}`),
    staleTime: 5 * 60_000,
  });
}
