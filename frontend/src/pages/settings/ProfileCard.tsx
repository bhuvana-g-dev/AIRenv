import { MapPin } from "lucide-react";
import { LocationSearch } from "../../components/LocationPicker";
import { Button, Card, CardHeader, Field, Toggle } from "../../components/ui";
import { cn } from "../../lib/cn";
import { COMMUNITY_TYPES, FAMILY_FIELDS } from "../../lib/profileOptions";
import { LANGUAGES } from "./constants";
import type { SectionProps } from "./hooks";

export function ProfileCard({ draft, setDraft, saving, save }: SectionProps) {
  const { location } = draft;
  return (
    <Card hover={false}>
      <CardHeader icon={<MapPin aria-hidden="true" className="h-4 w-4" />} title="Location & community" />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Display name">
          <input
            className="input"
            value={draft.display_name ?? ""}
            onChange={(e) => setDraft({ ...draft, display_name: e.target.value })}
            maxLength={60}
          />
        </Field>
        <Field
          label="Language for AI briefings, answers and Telegram"
          hint="Interface text is in English; AI-generated content follows this setting when Gemini is configured."
        >
          <select className="input" value={draft.language} onChange={(e) => setDraft({ ...draft, language: e.target.value })}>
            {LANGUAGES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field group label={`Monitored location · ${location.name} (${location.lat.toFixed(3)}, ${location.lon.toFixed(3)})`}>
          <LocationSearch onSelect={(l) => setDraft({ ...draft, location: l })} />
        </Field>
        <Field group label="Household / community type">
          <div className="grid gap-1.5">
            {COMMUNITY_TYPES.map((t) => (
              <button
                type="button"
                key={t.value}
                aria-pressed={draft.community_type === t.value}
                onClick={() => setDraft({ ...draft, community_type: t.value })}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs",
                  draft.community_type === t.value ? "border-mint/40 bg-emerald/10" : "hairline hover:bg-white/5",
                )}
              >
                <t.icon aria-hidden="true" className="h-3.5 w-3.5 text-mint" /> {t.label}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <div className="mt-4 border-t hairline pt-3">
        <p className="mb-1 text-xs font-medium text-muted">Optional family context</p>
        <div className="grid md:grid-cols-2 md:gap-x-6">
          {FAMILY_FIELDS.map((f) => (
            <Toggle
              key={f.key}
              label={f.label}
              checked={draft.family_context[f.key]}
              onChange={(v) => setDraft({ ...draft, family_context: { ...draft.family_context, [f.key]: v } })}
            />
          ))}
        </div>
      </div>
      <Button
        className="mt-3"
        loading={saving}
        onClick={() => save(["display_name", "language", "location", "community_type", "family_context"])}
      >
        Save profile
      </Button>
    </Card>
  );
}
