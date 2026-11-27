import { useState } from "react";
import { Button, Field, Modal, Toggle } from "../../components/ui";
import { useAddEvent, type EventDraft } from "./hooks";

const DAY_MS = 86_400_000;

function initialDraft(): EventDraft {
  const tomorrow = new Date(Date.now() + DAY_MS).toISOString().slice(0, 10);
  return { title: "", activity_type: "sports", intensity: "high", outdoor: true, date: tomorrow, time: "15:00", duration_hours: 2 };
}

export function AddEventModal({ cid, open, onClose }: { cid: string; open: boolean; onClose: () => void }) {
  const [f, setF] = useState(initialDraft);
  const add = useAddEvent(cid, onClose);
  const set = (changes: Partial<EventDraft>) => setF({ ...f, ...changes });
  return (
    <Modal open={open} onClose={onClose} title="Add an upcoming activity">
      <div className="space-y-3">
        <Field label="Title">
          <input className="input" value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="Annual sports day" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <input type="date" className="input" value={f.date} onChange={(e) => set({ date: e.target.value })} />
          </Field>
          <Field label="Start time">
            <input type="time" className="input" value={f.time} onChange={(e) => set({ time: e.target.value })} />
          </Field>
          <Field label="Intensity">
            <select className="input" value={f.intensity} onChange={(e) => set({ intensity: e.target.value })}>
              <option value="sedentary">Sedentary</option>
              <option value="light">Light</option>
              <option value="moderate">Moderate</option>
              <option value="high">High (sports, running)</option>
            </select>
          </Field>
          <Field label="Duration (hours)">
            <input
              type="number"
              min={1}
              max={8}
              className="input"
              value={f.duration_hours}
              onChange={(e) => set({ duration_hours: Number(e.target.value) })}
            />
          </Field>
        </div>
        <Toggle label="Outdoor activity" checked={f.outdoor} onChange={(v) => set({ outdoor: v })} />
        <p className="text-[11px] text-faint">
          AIRenv checks the forecast for this time immediately and re-checks it on every scheduled refresh.
        </p>
        <Button className="w-full" disabled={f.title.trim().length < 2} loading={add.isPending} onClick={() => add.mutate(f)}>
          Add & assess
        </Button>
      </div>
    </Modal>
  );
}
