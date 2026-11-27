import { useState } from "react";
import { Button, Field, Modal, Toggle } from "../../components/ui";
import type { RecordDraft } from "../../lib/community";
import type { CommunityDetail } from "../../lib/types";

export interface InitiativeDraft {
  type: string;
  title: string;
  description: string;
}

export function NewInitiativeModal({
  open,
  onClose,
  types,
  saving,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  types: CommunityDetail["initiative_types"];
  saving: boolean;
  onSave: (draft: InitiativeDraft) => void;
}) {
  const [ini, setIni] = useState<InitiativeDraft>({ type: "carpool", title: "", description: "" });
  return (
    <Modal open={open} onClose={onClose} title="New initiative">
      <div className="space-y-3">
        <Field label="Type">
          <select className="input" value={ini.type} onChange={(e) => setIni({ ...ini, type: e.target.value })}>
            {Object.entries(types).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Title">
          <input className="input" value={ini.title} onChange={(e) => setIni({ ...ini, title: e.target.value })} />
        </Field>
        <Field label="Description">
          <textarea
            className="input"
            value={ini.description}
            onChange={(e) => setIni({ ...ini, description: e.target.value })}
            maxLength={400}
          />
        </Field>
        <Button className="w-full" disabled={ini.title.trim().length < 2} loading={saving} onClick={() => onSave(ini)}>
          Create
        </Button>
      </div>
    </Modal>
  );
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <Field label={label}>
      <input type="number" min={0} className="input" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </Field>
  );
}

export function RecordModal({
  open,
  onClose,
  saving,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  saving: boolean;
  onSave: (rec: RecordDraft) => void;
}) {
  const [rec, setRec] = useState<RecordDraft>(() => ({
    date: new Date().toISOString().slice(0, 10),
    participants: 10,
    quantity: 0,
    km_shifted: 0,
    evidence_note: "",
    verified: false,
  }));
  const set = (changes: Partial<RecordDraft>) => setRec({ ...rec, ...changes });
  return (
    <Modal open={open} onClose={onClose} title="Add a participation record">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <input type="date" className="input" value={rec.date} onChange={(e) => set({ date: e.target.value })} />
          </Field>
          <NumberInput label="Participants" value={rec.participants} onChange={(v) => set({ participants: v })} />
          <NumberInput label="Quantity (unit of initiative)" value={rec.quantity} onChange={(v) => set({ quantity: v })} />
          <NumberInput label="Distance shifted (km, transport only)" value={rec.km_shifted} onChange={(v) => set({ km_shifted: v })} />
        </div>
        <Field label="Evidence note" hint="e.g. sign-up sheet, collection receipt. Avoid personal details.">
          <input className="input" value={rec.evidence_note} onChange={(e) => set({ evidence_note: e.target.value })} maxLength={300} />
        </Field>
        <Toggle label="I have verified this record" checked={rec.verified} onChange={(v) => set({ verified: v })} />
        <Button className="w-full" loading={saving} onClick={() => onSave(rec)}>
          Save record
        </Button>
      </div>
    </Modal>
  );
}
