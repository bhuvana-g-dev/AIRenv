import { useState } from "react";
import { useUpdateProfile } from "../../lib/queries";
import { useApp } from "../../lib/store";
import type { FamilyContext, Location, NotificationPrefs, Profile } from "../../lib/types";

export interface OnboardingDraft {
  location: Location;
  communityType: string;
  family: FamilyContext;
  prefs: NotificationPrefs;
}

/** Profile patch sent when onboarding ends; skipping only marks the profile as onboarded. */
export function onboardingPatch(draft: OnboardingDraft, skip: boolean): Partial<Profile> {
  if (skip) return { onboarded: true };
  return {
    onboarded: true,
    location: draft.location,
    community_type: draft.communityType,
    family_context: draft.family,
    notification_prefs: draft.prefs,
  };
}

/** Local draft of the onboarding answers plus the save action that closes the dialog. */
export function useOnboardingDraft(profile: Profile) {
  const [draft, setDraft] = useState<OnboardingDraft>({
    location: profile.location,
    communityType: profile.community_type,
    family: profile.family_context,
    prefs: profile.notification_prefs,
  });
  const [open, setOpen] = useState(true);
  const update = useUpdateProfile();
  const setLocation = useApp((s) => s.setLocation);

  const patch = (changes: Partial<OnboardingDraft>) => setDraft((d) => ({ ...d, ...changes }));

  const finish = (skip = false) => {
    update.mutate(onboardingPatch(draft, skip), {
      onSuccess: () => {
        if (!skip) setLocation(draft.location, true);
        setOpen(false);
      },
    });
  };

  return { draft, patch, open, finish, saving: update.isPending, error: update.error };
}
