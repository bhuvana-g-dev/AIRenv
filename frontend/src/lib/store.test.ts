import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LOCATION, TOAST_TIMEOUT_MS, useApp, useToasts } from "./store";

describe("useApp store", () => {
  beforeEach(() => {
    useApp.setState({ location: DEFAULT_LOCATION, locationFromProfile: false, demo: false, sidebarCollapsed: false });
  });

  it("sets the location and remembers whether it came from the profile", () => {
    const pune = { id: "18.52_73.86", name: "Pune", lat: 18.52, lon: 73.86 };
    useApp.getState().setLocation(pune);
    expect(useApp.getState()).toMatchObject({ location: pune, locationFromProfile: false });
    useApp.getState().setLocation(pune, true);
    expect(useApp.getState().locationFromProfile).toBe(true);
  });

  it("toggles the sidebar and demo mode", () => {
    useApp.getState().toggleSidebar();
    expect(useApp.getState().sidebarCollapsed).toBe(true);
    useApp.getState().toggleSidebar();
    expect(useApp.getState().sidebarCollapsed).toBe(false);
    useApp.getState().setDemo(true);
    expect(useApp.getState().demo).toBe(true);
  });

  it("persists only location and sidebar state (never demo mode)", () => {
    useApp.getState().setDemo(true);
    useApp.getState().toggleSidebar();
    const saved = JSON.parse(localStorage.getItem("airenv-app") ?? "{}");
    expect(saved.state).toEqual({ location: DEFAULT_LOCATION, sidebarCollapsed: true });
  });
});

describe("useToasts store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useToasts.setState({ toasts: [] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const push = (title: string) => act(() => useToasts.getState().push({ title, tone: "info" }));
  const advance = (ms: number) =>
    act(() => {
      vi.advanceTimersByTime(ms);
    });

  it("adds toasts with unique ids and auto-dismisses them", () => {
    push("One");
    push("Two");
    const [a, b] = useToasts.getState().toasts;
    expect(a.id).not.toBe(b.id);
    advance(TOAST_TIMEOUT_MS + 1);
    expect(useToasts.getState().toasts).toHaveLength(0);
  });

  it("keeps at most four toasts, dropping the oldest", () => {
    ["1", "2", "3", "4", "5"].forEach(push);
    expect(useToasts.getState().toasts.map((t) => t.title)).toEqual(["2", "3", "4", "5"]);
  });

  it("dismisses a toast on demand", () => {
    push("Bye");
    const id = useToasts.getState().toasts[0].id;
    act(() => useToasts.getState().dismiss(id));
    expect(useToasts.getState().toasts).toHaveLength(0);
  });

  it("pauses auto-dismiss while held and restarts it on release", () => {
    push("Hold me");
    const id = useToasts.getState().toasts[0].id;
    act(() => useToasts.getState().hold(id));
    advance(TOAST_TIMEOUT_MS * 3);
    expect(useToasts.getState().toasts).toHaveLength(1);
    act(() => useToasts.getState().release(id));
    advance(TOAST_TIMEOUT_MS - 1);
    expect(useToasts.getState().toasts).toHaveLength(1);
    advance(2);
    expect(useToasts.getState().toasts).toHaveLength(0);
  });

  it("release of an unknown toast is a no-op", () => {
    act(() => useToasts.getState().release("missing"));
    advance(TOAST_TIMEOUT_MS * 2);
    expect(useToasts.getState().toasts).toHaveLength(0);
  });
});
