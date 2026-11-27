import { useEffect, useRef, type RefObject } from "react";
import { useLocation } from "react-router-dom";
import { useRefresh } from "../../lib/queries";
import { useApp, useToasts } from "../../lib/store";
import type { Profile } from "../../lib/types";
import { useSaveLocation } from "../../lib/useSaveLocation";

/** Manual "refresh now": re-fetches provider data and reports the outcome as a toast. */
export function useRefreshAction() {
  const refresh = useRefresh();
  const push = useToasts((s) => s.push);
  const run = () =>
    refresh.mutate(undefined, {
      onSuccess: () => push({ title: "Data refreshed", message: "Latest provider data processed.", tone: "success" }),
      onError: (e) => push({ title: "Refresh failed", message: e.message, tone: "danger" }),
    });
  return { run, pending: refresh.isPending };
}

/**
 * Keeps the app location in sync with the signed-in profile: adopts the saved location once
 * per session, and returns a chooser that also persists a new pick to the profile.
 */
export function useProfileLocation(profile: Profile | undefined) {
  const setLocation = useApp((s) => s.setLocation);
  const fromProfile = useApp((s) => s.locationFromProfile);

  useEffect(() => {
    if (profile && !fromProfile) setLocation(profile.location, true);
  }, [profile, fromProfile, setLocation]);

  return useSaveLocation();
}

/** On client-side navigation, move focus to the new page so screen readers start at its content. */
export function useFocusOnNavigate(target: RefObject<HTMLElement | null>) {
  const { pathname } = useLocation();
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    target.current?.focus({ preventScroll: true });
  }, [pathname, target]);
}
