import { useProfile, useUpdateProfile } from "./queries";
import { useApp } from "./store";
import type { Location } from "./types";

/** Returns a setter that switches the app location and, when signed in, saves it to the profile. */
export function useSaveLocation() {
  const profile = useProfile();
  const update = useUpdateProfile();
  const setLocation = useApp((s) => s.setLocation);
  return (l: Location) => {
    setLocation(l, true);
    if (profile.data) update.mutate({ location: l });
  };
}
