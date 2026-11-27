import { Download, Lock, Trash2 } from "lucide-react";
import { Button, Card, CardHeader, Field, Toggle } from "../../components/ui";
import { clampInt } from "../../lib/settings";
import type { Profile } from "../../lib/types";
import type { SectionProps } from "./hooks";

export function PrivacyCard({
  draft,
  setDraft,
  saving,
  save,
  onExport,
  onDelete,
}: SectionProps & { onExport: () => void; onDelete: () => void }) {
  const privacy = draft.privacy;
  const setPrivacy = (patch: Partial<Profile["privacy"]>) => setDraft({ ...draft, privacy: { ...privacy, ...patch } });
  return (
    <Card hover={false}>
      <CardHeader
        icon={<Lock aria-hidden="true" className="h-4 w-4" />}
        title="Privacy permissions"
        subtitle="You control what AIRenv processes and keeps"
      />
      <Toggle
        label="Allow Conversation Intelligence for my communities"
        description="Lets AIRenv extract planned activities from groups that also opted in. Raw messages are never stored."
        checked={privacy.conversation_intelligence}
        onChange={(v) => setPrivacy({ conversation_intelligence: v })}
      />
      <Toggle
        label="Keep extracted event fields"
        description="Activity type, date and time only, deleted automatically after the retention period."
        checked={privacy.store_extracted_events}
        onChange={(v) => setPrivacy({ store_extracted_events: v })}
      />
      <Toggle
        label="Include me in aggregate participation counts"
        checked={privacy.share_aggregate_participation}
        onChange={(v) => setPrivacy({ share_aggregate_participation: v })}
      />
      <div className="max-w-xs py-2">
        <Field label="Extracted event retention (days)">
          <input
            type="number"
            min={1}
            max={90}
            className="input"
            value={privacy.event_retention_days}
            onChange={(e) => setPrivacy({ event_retention_days: clampInt(Number(e.target.value), 1, 90) })}
          />
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button loading={saving} onClick={() => save(["privacy"])}>
          Save privacy
        </Button>
        <Button variant="outline" icon={<Download aria-hidden="true" className="h-4 w-4" />} onClick={onExport}>
          Export my data
        </Button>
        <Button variant="danger" icon={<Trash2 aria-hidden="true" className="h-4 w-4" />} onClick={onDelete}>
          Delete my data
        </Button>
      </div>
    </Card>
  );
}
