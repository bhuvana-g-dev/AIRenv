import { motion } from "motion/react";
import { Send, ShieldAlert, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Badge, Button } from "../../components/ui";
import { textColorForAqi } from "../../lib/aqi";
import { eventMeta } from "../../lib/community";
import { fmtNum } from "../../lib/format";
import type { CommunityEvent } from "../../lib/types";
import { useAdvisoryDecision, useDeleteEvent } from "./hooks";

const NEUTRAL = "#94A89D";

function RiskBadge({ ev }: { ev: CommunityEvent }) {
  const r = ev.risk;
  if (!r) return <Badge color={NEUTRAL}>not assessed</Badge>;
  if (r.level === "unknown") return <Badge color={NEUTRAL}>outside forecast range</Badge>;
  const color = r.sub_index != null ? textColorForAqi(r.sub_index) : NEUTRAL;
  return (
    <Badge color={color} dot>
      {r.category_label ?? r.level} · PM2.5 ~{fmtNum(r.forecast_pm2_5)}
    </Badge>
  );
}

const STATUS_NOTE = {
  sent: <p className="mt-2 text-[11px] text-emerald">✓ Advisory posted to the group</p>,
  approved: <p className="mt-2 text-[11px] text-muted">Approved. No live Telegram group was available to deliver it.</p>,
  dismissed: <p className="mt-2 text-[11px] text-faint">Advisory dismissed by an administrator.</p>,
};

/** Pending advisory: shows the draft, lets an administrator edit, approve and send, or dismiss it. */
function PendingAdvisory({ ev, cid, canManage }: { ev: CommunityEvent; cid: string; canManage: boolean }) {
  const [text, setText] = useState(ev.advisory?.text ?? "");
  const [editing, setEditing] = useState(false);
  const decide = useAdvisoryDecision(cid, ev);
  return (
    <div className="mt-3 rounded-xl border border-cyan/25 bg-cyan/5 p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-cyan">
        <ShieldAlert aria-hidden="true" className="h-3.5 w-3.5" /> Advisory awaiting human approval
      </p>
      {editing ? (
        <textarea
          aria-label={`Advisory text for ${ev.title}`}
          className="input mt-2 min-h-24 text-xs"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
        />
      ) : (
        <p className="mt-1.5 text-xs leading-relaxed text-ink/85">{text}</p>
      )}
      {canManage && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button
            size="sm"
            icon={<Send aria-hidden="true" className="h-3.5 w-3.5" />}
            loading={decide.isPending && decide.variables.action === "approve"}
            onClick={() => decide.mutate({ action: "approve", text })}
          >
            Approve & send
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(!editing)}>
            {editing ? "Done editing" : "Edit"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<X aria-hidden="true" className="h-3.5 w-3.5" />}
            onClick={() => decide.mutate({ action: "dismiss", text })}
          >
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}

export function EventRow({ ev, cid, canManage }: { ev: CommunityEvent; cid: string; canManage: boolean }) {
  const remove = useDeleteEvent(cid, ev.id);
  const status = ev.advisory?.status ?? "none";
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border hairline bg-black/15 p-3.5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {ev.title} {ev.is_demo && <Badge color="#A78BFA">demo</Badge>}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">{eventMeta(ev)}</p>
        </div>
        <div className="flex items-center gap-2">
          <RiskBadge ev={ev} />
          {canManage && (
            <button
              type="button"
              onClick={() => remove.mutate()}
              className="rounded-lg p-1.5 text-faint hover:bg-white/5 hover:text-red-300"
              aria-label={`Delete activity: ${ev.title}`}
            >
              <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {ev.risk?.summary && <p className="mt-2 text-xs leading-relaxed text-muted">{ev.risk.summary}</p>}
      {ev.risk?.best_alternative && (
        <p className="mt-1 text-xs text-mint">
          Cleaner window: {ev.risk.best_alternative.start.slice(11, 16)} (~{fmtNum(ev.risk.best_alternative.mean_pm2_5)} µg/m³)
        </p>
      )}
      {status === "pending" && <PendingAdvisory ev={ev} cid={cid} canManage={canManage} />}
      {status !== "pending" && status !== "none" && STATUS_NOTE[status]}
    </motion.li>
  );
}
