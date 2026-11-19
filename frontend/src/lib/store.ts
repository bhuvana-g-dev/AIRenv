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
}

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 6000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));
