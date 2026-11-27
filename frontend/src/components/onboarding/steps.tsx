import { Bell, Check, MapPin } from "lucide-react";
import { cn } from "../../lib/cn";
import { COMMUNITY_TYPES, FAMILY_FIELDS } from "../../lib/profileOptions";
import { LocationSearch } from "../LocationPicker";
import { Toggle } from "../ui";
import type { OnboardingDraft } from "./useOnboardingDraft";

export interface StepProps {
  draft: OnboardingDraft;
  patch: (changes: Partial<OnboardingDraft>) => void;
}

export function LocationStep({ draft, patch }: StepProps) {
  const { location } = draft;
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 rounded-xl border border-mint/20 bg-emerald/5 px-3 py-2 text-sm">
        <MapPin aria-hidden="true" className="h-4 w-4 text-mint" /> <span className="sr-only">Selected location:</span> {location.name}{" "}
        <span className="text-xs text-faint">
          ({location.lat.toFixed(2)}, {location.lon.toFixed(2)})
        </span>
      </div>
      <LocationSearch onSelect={(l) => patch({ location: l })} />
    </div>
  );
}

export function AudienceStep({ draft, patch }: StepProps) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {COMMUNITY_TYPES.map((t) => {
        const selected = draft.communityType === t.value;
        return (
          <button
            key={t.value}
            type="button"
            aria-pressed={selected}
            onClick={() => patch({ communityType: t.value })}
            className={cn(
              "flex items-center gap-3 rounded-xl border p-3 text-left text-sm transition-colors",
              selected ? "border-mint/40 bg-emerald/10" : "hairline hover:bg-white/5",
            )}
          >
            <t.icon aria-hidden="true" className="h-4 w-4 text-mint" />
            {t.label}
            {selected && <Check aria-hidden="true" className="ml-auto h-4 w-4 text-mint" />}
          </button>
        );
      })}
    </div>
  );
}

export function FamilyStep({ draft, patch }: StepProps) {
  return (
    <div>
      <p className="mb-2 text-xs text-muted">Used only to tune recommendations and alert thresholds. No medical details are collected.</p>
      {FAMILY_FIELDS.map((f) => (
        <Toggle
          key={f.key}
          label={f.label}
          checked={draft.family[f.key]}
          onChange={(v) => patch({ family: { ...draft.family, [f.key]: v } })}
        />
      ))}
    </div>
  );
}

export function ReachStep({ draft, patch }: StepProps) {
  const { prefs } = draft;
  return (
    <div>
      <Toggle
        label="In-app alerts"
        description="Real-time alerts in this dashboard."
        checked={prefs.in_app}
        onChange={(v) => patch({ prefs: { ...prefs, in_app: v } })}
      />
      <Toggle
        label="Quiet hours (22:00–07:00)"
        description="Only critical alerts during the night."
        checked={prefs.quiet_hours.enabled}
        onChange={(v) => patch({ prefs: { ...prefs, quiet_hours: { ...prefs.quiet_hours, enabled: v } } })}
      />
      <div className="mt-3 flex items-center gap-2 rounded-xl border hairline bg-black/20 p-3 text-xs text-muted">
        <Bell aria-hidden="true" className="h-4 w-4 text-cyan" /> Connect Telegram later in Settings to receive alerts without opening
        AIRenv.
      </div>
    </div>
  );
}
