import { BadgeCheck, Check, CircleDashed, Plus } from "lucide-react";
import { useState } from "react";
import { Button, Card, CardHeader, EmptyState } from "../../components/ui";
import type { CommunityDetail, Initiative } from "../../lib/types";
import { useInitiativeActions } from "./hooks";
import { NewInitiativeModal, RecordModal } from "./InitiativeModals";

type InitiativeRecord = Initiative["records"][number];

function RecordStatus({ r, canManage, onVerify }: { r: InitiativeRecord; canManage: boolean; onVerify: (id: string) => void }) {
  if (r.verified)
    return (
      <span className="flex items-center gap-1 text-emerald">
        <Check aria-hidden="true" className="h-3 w-3" /> verified
      </span>
    );
  if (!canManage) return <span className="text-yellow-300">pending</span>;
  return (
    <button
      type="button"
      onClick={() => onVerify(r.id)}
      aria-label={`Verify record from ${r.date} (${r.participants} participants)`}
      className="flex items-center gap-1 py-0.5 text-yellow-300 hover:underline"
    >
      <CircleDashed aria-hidden="true" className="h-3 w-3" /> verify
    </button>
  );
}

function InitiativeItem({
  i,
  canManage,
  onRecord,
  onVerify,
}: {
  i: Initiative;
  canManage: boolean;
  onRecord: () => void;
  onVerify: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border hairline bg-black/15 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{i.title}</p>
          <p className="text-[11px] text-muted">{i.label}</p>
        </div>
        {canManage && (
          <Button size="sm" variant="ghost" icon={<Plus aria-hidden="true" className="h-3 w-3" />} onClick={onRecord}>
            Record
          </Button>
        )}
      </div>
      <ul className="mt-2 space-y-1">
        {i.records.slice(0, 4).map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-muted">
              {r.date} · {r.participants} participants{r.km_shifted ? ` · ${r.km_shifted} km` : ""}
            </span>
            <RecordStatus r={r} canManage={canManage} onVerify={onVerify} />
          </li>
        ))}
        {i.records.length === 0 && <li className="text-[11px] text-faint">No records yet.</li>}
      </ul>
    </div>
  );
}

export function Initiatives({ detail }: { detail: CommunityDetail }) {
  const can = detail.community.can_manage;
  const [addIni, setAddIni] = useState(false);
  const [recFor, setRecFor] = useState<string | null>(null);
  const { createInitiative, createRecord, verify } = useInitiativeActions(detail.community.id);
  const verifyRecord = (id: string) => verify.mutate(id);

  return (
    <Card hover={false} className="lg:col-span-2">
      <CardHeader
        icon={<BadgeCheck aria-hidden="true" className="h-4 w-4" />}
        title="Sustainable initiatives"
        subtitle="Only administrator-verified records count toward statistics"
        action={
          can && (
            <Button size="sm" variant="outline" icon={<Plus aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => setAddIni(true)}>
              Initiative
            </Button>
          )
        }
      />
      {detail.initiatives.length === 0 ? (
        <EmptyState
          title="No initiatives yet"
          description="Track carpools, public-transport weeks, waste segregation or no-burn drives. Add records when they happen; there's no daily logging."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {detail.initiatives.map((i) => (
            <InitiativeItem key={i.id} i={i} canManage={can} onRecord={() => setRecFor(i.id)} onVerify={verifyRecord} />
          ))}
        </div>
      )}
      <NewInitiativeModal
        open={addIni}
        onClose={() => setAddIni(false)}
        types={detail.initiative_types}
        saving={createInitiative.isPending}
        onSave={(draft) => createInitiative.mutate(draft, { onSuccess: () => setAddIni(false) })}
      />
      <RecordModal
        open={Boolean(recFor)}
        onClose={() => setRecFor(null)}
        saving={createRecord.isPending}
        onSave={(rec) => {
          if (!recFor) return;
          const type = detail.initiatives.find((i) => i.id === recFor)?.type;
          createRecord.mutate({ initiativeId: recFor, type, rec }, { onSuccess: () => setRecFor(null) });
        }}
      />
    </Card>
  );
}
