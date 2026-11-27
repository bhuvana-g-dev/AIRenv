import { motion } from "motion/react";
import { BellRing, CheckCheck, Trash2 } from "lucide-react";
import { Badge } from "../../components/ui";
import { ALERT_CATEGORIES, deliveryStatusText } from "../../lib/alerts";
import { SEVERITY_COLORS, SEVERITY_LABEL } from "../../lib/aqi";
import { cn } from "../../lib/cn";
import { absoluteTime, timeAgo } from "../../lib/format";
import type { NotificationItem } from "../../lib/types";

/** Tailwind's ring colour variable; set inline so unread alerts get a ring in their severity colour. */
const RING_COLOR_VAR: string = "--tw-ring-color";

export function AlertItem({ n, onRead, onDelete }: { n: NotificationItem; onRead: () => void; onDelete: () => void }) {
  const c = SEVERITY_COLORS[n.severity];
  const category = ALERT_CATEGORIES[n.category] as (typeof ALERT_CATEGORIES)[keyof typeof ALERT_CATEGORIES] | undefined;
  const Icon = category?.icon ?? BellRing;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24, height: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 34 }}
      className={cn("glass relative overflow-hidden rounded-2xl p-4", !n.read && "ring-1 ring-inset")}
      style={!n.read ? { [RING_COLOR_VAR]: `${c}40` } : undefined}
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1" style={{ background: c }} />
      <div className="flex gap-3">
        <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: `${c}18`, color: c }}>
          <Icon aria-hidden="true" className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{n.title}</p>
            <Badge color={c}>{SEVERITY_LABEL[n.severity]}</Badge>
            {!n.read && (
              <span className="inline-flex items-center gap-1 text-[10px] text-cyan">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-cyan" />
                Unread
              </span>
            )}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted">{n.message}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-faint">
            <span>{category?.label}</span>
            <span title={absoluteTime(n.created_at)}>{timeAgo(n.created_at)}</span>
            <span>in-app ✓</span>
            <span>Telegram: {deliveryStatusText(n.delivery.telegram)}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          {!n.read && (
            <button
              type="button"
              onClick={onRead}
              className="rounded-lg p-1.5 text-faint hover:bg-white/5 hover:text-ink"
              aria-label={`Mark as read: ${n.title}`}
              title="Mark as read"
            >
              <CheckCheck aria-hidden="true" className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg p-1.5 text-faint hover:bg-white/5 hover:text-red-300"
            aria-label={`Delete alert: ${n.title}`}
            title="Delete"
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.li>
  );
}
