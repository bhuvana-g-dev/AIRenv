import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { API_BASE, post } from "./api";
import { useToasts, type Toast } from "./store";
import type { FeedItem, NotificationItem } from "./types";

type LiveStatus = "connecting" | "live" | "offline";

export const useLiveStatus = create<{ status: LiveStatus; lastEventAt: number | null; set: (s: LiveStatus) => void; tick: () => void }>(
  (set) => ({
    status: "connecting",
    lastEventAt: null,
    set: (status) => set({ status }),
    tick: () => set({ lastEventAt: Date.now() }),
  }),
);

const BASE_RETRY_MS = 2000;
const MAX_RETRY_MS = 30000;

/** Exponential back-off for SSE reconnects: 2 s, 4 s, 8 s … capped at 30 s. */
export function reconnectDelay(attempt: number): number {
  return Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** attempt);
}

/** Toast tone for a pushed notification: severe ones are danger, good news is success. */
export function notificationTone(n: Pick<NotificationItem, "severity" | "category">): Toast["tone"] {
  if (n.severity === "critical" || n.severity === "high") return "danger";
  return n.category === "positive" ? "success" : "warning";
}

/** SSE payloads are JSON strings produced by our own backend. */
function parseEventData<T>(e: MessageEvent): T {
  return JSON.parse(e.data as string) as T;
}

/**
 * Subscribes to server-sent events for a location (and, with a ticket, the signed-in user).
 * Updates React Query caches in place so only affected components re-render.
 */
export function useLiveStream(locationId: string | undefined) {
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const setStatus = useLiveStatus((s) => s.set);
  const tick = useLiveStatus((s) => s.tick);
  const retry = useRef(0);

  useEffect(() => {
    if (!locationId) return;
    let es: EventSource | null = null;
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = async () => {
      setStatus("connecting");
      let ticket = "";
      try {
        ticket = (await post<{ ticket: string }>("/api/stream/ticket")).ticket;
      } catch {
        ticket = ""; // anonymous: location events only
      }
      if (closed) return;
      const url = `${API_BASE}/api/stream?location_id=${encodeURIComponent(locationId)}${ticket ? `&ticket=${ticket}` : ""}`;
      es = new EventSource(url);
      es.addEventListener("ready", () => {
        retry.current = 0;
        setStatus("live");
      });
      es.addEventListener("snapshot.updated", () => {
        tick();
        void qc.invalidateQueries({ queryKey: ["bundle"] });
        void qc.invalidateQueries({ queryKey: ["briefing"] });
        void qc.invalidateQueries({ queryKey: ["history"] });
      });
      es.addEventListener("feed.created", (e) => {
        tick();
        const item = parseEventData<FeedItem>(e);
        qc.setQueriesData<{ items: FeedItem[] }>({ queryKey: ["feed"] }, (old) =>
          old && !old.items.some((x) => x.id === item.id) ? { ...old, items: [item, ...old.items] } : old,
        );
      });
      es.addEventListener("notification.created", (e) => {
        tick();
        const n = parseEventData<NotificationItem>(e);
        void qc.invalidateQueries({ queryKey: ["notifications"] });
        push({ title: n.title, message: n.message, tone: notificationTone(n) });
      });
      es.onerror = () => {
        setStatus("offline");
        es?.close();
        if (closed) return;
        timer = setTimeout(() => void connect(), reconnectDelay(retry.current++));
      };
    };
    void connect();
    return () => {
      closed = true;
      es?.close();
      if (timer) clearTimeout(timer);
    };
  }, [locationId, qc, push, setStatus, tick]);
}
