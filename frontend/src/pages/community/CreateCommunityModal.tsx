import { useState } from "react";
import { LocationSearch } from "../../components/LocationPicker";
import { Button, Field, Modal } from "../../components/ui";
import { COMMUNITY_TYPE_LABEL } from "../../lib/community";
import { useApp } from "../../lib/store";
import type { Location } from "../../lib/types";
import { useCreateCommunity } from "./hooks";

export function CreateCommunityModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const current = useApp((s) => s.location);
  const [name, setName] = useState("");
  const [type, setType] = useState("school");
  const [loc, setLoc] = useState<Location>(current);
  const create = useCreateCommunity(onClose);
  return (
    <Modal open={open} onClose={onClose} title="Create a community">
      <div className="space-y-4">
        <Field label="Name">
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sunrise Public School"
            maxLength={80}
          />
        </Field>
        <Field label="Type">
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(COMMUNITY_TYPE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Location · ${loc.name}`} group>
          <LocationSearch onSelect={setLoc} />
        </Field>
        <Button
          className="w-full"
          disabled={name.trim().length < 2}
          loading={create.isPending}
          onClick={() => create.mutate({ name, type, location: loc })}
        >
          Create community
        </Button>
      </div>
    </Modal>
  );
}
