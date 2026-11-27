import { Link2, Users } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, CardHeader, Tabs } from "../../components/ui";
import type { CommunityDetail, TgGroup } from "../../lib/types";
import { useGroupActions } from "./hooks";

const REPLY_MODES: { value: TgGroup["reply_mode"]; label: string }[] = [
  { value: "approval", label: "Admin approval" },
  { value: "auto", label: "Auto-reply" },
];

type UpdateGroup = (gid: string, body: Record<string, unknown>) => void;

function GroupItem({ g, canManage, onUpdate }: { g: TgGroup; canManage: boolean; onUpdate: UpdateGroup }) {
  return (
    <li className="rounded-xl border hairline bg-black/15 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {g.title} {g.is_demo && <Badge color="#A78BFA">demo</Badge>}
        </span>
        <Badge color={g.authorized ? "#35D399" : "#94A89D"} dot>
          {g.authorized ? "opted in" : "not opted in"}
        </Badge>
      </div>
      {canManage && g.authorized && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <Tabs
            label={`Reply mode for ${g.title}`}
            layoutId={`mode-${g.id}`}
            value={g.reply_mode}
            onChange={(v) => onUpdate(g.id, { reply_mode: v })}
            tabs={REPLY_MODES}
          />
          <button type="button" onClick={() => onUpdate(g.id, { authorized: false })} className="py-1 text-faint hover:text-red-300">
            Revoke & delete extracted events
          </button>
        </div>
      )}
      {canManage && !g.authorized && g.is_demo && (
        <button type="button" onClick={() => onUpdate(g.id, { authorized: true })} className="mt-2 py-1 text-xs text-cyan hover:underline">
          Simulate group opt-in (demo)
        </button>
      )}
    </li>
  );
}

export function GroupsPanel({ detail }: { detail: CommunityDetail }) {
  const cid = detail.community.id;
  const can = detail.community.can_manage;
  const [code, setCode] = useState("");
  const { connect, update } = useGroupActions(cid, () => setCode(""));
  const onUpdate: UpdateGroup = (gid, body) => update.mutate({ gid, body });
  return (
    <Card hover={false}>
      <CardHeader
        icon={<Users aria-hidden="true" className="h-4 w-4" />}
        title="Participating groups"
        subtitle="Telegram groups opted in by their administrators"
      />
      {detail.groups.length === 0 ? (
        <p className="mb-3 text-xs text-muted">
          No groups connected. Add the AIRenv bot to a Telegram group, have a group admin send <code className="text-cyan">/optin</code>,
          then enter the code it returns.
        </p>
      ) : (
        <ul className="mb-3 space-y-2">
          {detail.groups.map((g) => (
            <GroupItem key={g.id} g={g} canManage={can} onUpdate={onUpdate} />
          ))}
        </ul>
      )}
      {can && (
        <div className="flex gap-2">
          <input
            className="input"
            aria-label="Group connect code"
            placeholder="Group connect code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <Button
            variant="outline"
            icon={<Link2 aria-hidden="true" className="h-4 w-4" />}
            disabled={code.length < 4}
            loading={connect.isPending}
            onClick={() => connect.mutate(code)}
          >
            Connect
          </Button>
        </div>
      )}
    </Card>
  );
}
