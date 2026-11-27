import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bell,
  Brain,
  CloudFog,
  Leaf,
  Radio,
  ShieldCheck,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { SEVERITY_COLORS, SEVERITY_LABEL } from "../../lib/aqi";
import { timeAgo } from "../../lib/format";
import type { FeedItem } from "../../lib/types";

const FEED_ICONS: Record<string, LucideIcon | undefined> = {
  monitoring_started: Radio,
  category_change: Activity,
  pollution_increase: ArrowUpRight,
  forecast_deterioration: AlertTriangle,
  poor_dispersion: Wind,
  event_risk: Bell,
  source_unavailable: CloudFog,
  source_recovered: ShieldCheck,
  recommendation: Brain,
};

function FeedEntry({ item }: { item: FeedItem }) {
  const c = SEVERITY_COLORS[item.severity] ?? "#55D6E8";
  const Icon = FEED_ICONS[item.type] ?? Leaf;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: -12, height: 0 }}
      animate={{ opacity: 1, x: 0, height: "auto" }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      className="relative flex gap-3 rounded-lg py-2 pr-2"
    >
      <span
        aria-hidden="true"
        className="relative z-10 mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border"
        style={{ color: c, borderColor: `${c}40`, background: "#0B1914" }}
      >
        <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[13px] font-medium">
            <span className="sr-only">{SEVERITY_LABEL[item.severity] ?? "Info"} severity: </span>
            {item.title}
          </span>
          <span className="text-[10px] text-faint">{timeAgo(item.created_at)}</span>
        </div>
        {item.detail && <p className="mt-0.5 text-xs leading-relaxed text-muted">{item.detail}</p>}
      </div>
    </motion.li>
  );
}

export function FeedList({
  items,
  max = 8,
  live = false,
  label = "Intelligence feed",
}: {
  items: FeedItem[];
  max?: number;
  live?: boolean;
  label?: string;
}) {
  return (
    <div className="relative">
      <span
        className="absolute bottom-2 left-[15px] top-2 w-px bg-gradient-to-b from-mint/30 via-mint/10 to-transparent"
        aria-hidden="true"
      />
      <ol
        className="relative space-y-1"
        aria-label={label}
        aria-live={live ? "polite" : undefined}
        aria-relevant={live ? "additions" : undefined}
      >
        <AnimatePresence initial={false}>
          {items.slice(0, max).map((it) => (
            <FeedEntry key={it.id} item={it} />
          ))}
        </AnimatePresence>
      </ol>
    </div>
  );
}
