import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { API_BASE, post } from "./api";
import { useToasts } from "./store";
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
        const item = JSON.parse((e as MessageEvent).data) as FeedItem;
        qc.setQueriesData<{ items: FeedItem[] }>({ queryKey: ["feed"] }, (old) =>
          old && !old.items.some((x) => x.id === item.id) ? { ...old, items: [item, ...old.items] } : old,
        );
      });
      es.addEventListener("notification.created", (e) => {
        tick();
        const n = JSON.parse((e as MessageEvent).data) as NotificationItem;
        void qc.invalidateQueries({ queryKey: ["notifications"] });
        push({
          title: n.title,
          message: n.message,
          tone: n.severity === "critical" || n.severity === "high" ? "danger" : n.category === "positive" ? "success" : "warning",
        });
      });
      es.onerror = () => {
        setStatus("offline");
        es?.close();
        if (closed) return;
        const delay = Math.min(30000, 2000 * 2 ** retry.current++);
        timer = setTimeout(connect, delay);
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
