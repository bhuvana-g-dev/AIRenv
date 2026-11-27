import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Location } from "./types";

export const DEFAULT_LOCATION: Location = {
  id: "28.61_77.21",
  name: "New Delhi",
  lat: 28.6139,
  lon: 77.209,
  country: "India",
  admin1: "Delhi",
  timezone: "Asia/Kolkata",
};

interface AppState {
  location: Location;
  locationFromProfile: boolean;
  demo: boolean;
  sidebarCollapsed: boolean;
  setLocation: (l: Location, fromProfile?: boolean) => void;
  setDemo: (d: boolean) => void;
  toggleSidebar: () => void;
}

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      location: DEFAULT_LOCATION,
      locationFromProfile: false,
      demo: false,
      sidebarCollapsed: false,
      setLocation: (location, fromProfile = false) => set({ location, locationFromProfile: fromProfile }),
      setDemo: (demo) => set({ demo }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    {
      name: "airenv-app",
      partialize: (s) => ({ location: s.location, sidebarCollapsed: s.sidebarCollapsed }),
    },
  ),
);

export interface Toast {
  id: string;
  title: string;
  message?: string;
  tone: "info" | "success" | "warning" | "danger" | "ai";
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
  /** Stop the auto-dismiss timer while the user hovers or focuses a toast (WCAG 2.2.1). */
  hold: (id: string) => void;
  /** Restart the auto-dismiss timer. */
  release: (id: string) => void;
}

export const TOAST_TIMEOUT_MS = 6000;
const MAX_TOASTS = 4;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export const useToasts = create<ToastState>((set, get) => {
  const schedule = (id: string) => {
    clearTimeout(timers.get(id));
    timers.set(id, setTimeout(() => get().dismiss(id), TOAST_TIMEOUT_MS));
  };
  return {
    toasts: [],
    push: (t) => {
      const id = Math.random().toString(36).slice(2);
      set((s) => ({ toasts: [...s.toasts.slice(-(MAX_TOASTS - 1)), { ...t, id }] }));
      schedule(id);
    },
    dismiss: (id) => {
      clearTimeout(timers.get(id));
      timers.delete(id);
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
    },
    hold: (id) => {
      clearTimeout(timers.get(id));
      timers.delete(id);
    },
    release: (id) => {
      if (get().toasts.some((x) => x.id === id)) schedule(id);
    },
  };
});
