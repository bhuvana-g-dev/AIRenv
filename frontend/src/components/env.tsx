import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Brain,
  ChevronDown,
  CloudFog,
  Database,
  Droplets,
  ExternalLink,
  FlaskConical,
  Gauge,
  Leaf,
  Minus,
  Radio,
  ShieldCheck,
  Sparkles,
  Thermometer,
  Wind,
} from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { CATEGORY_COLORS, CATEGORY_TEXT_COLORS, SEVERITY_COLORS, SEVERITY_LABEL, colorForAqi } from "../lib/aqi";
import { absoluteTime, fmtNum, timeAgo, windDirection } from "../lib/format";
import type { FeedItem, PollutantKey, Recommendation, Snapshot } from "../lib/types";
import { AnimatedNumber, Badge, Button } from "./ui";
import { cn } from "../lib/cn";

/* ------------------------------------------------------------------ AQI gauge */
export function AqiGauge({ value, category, size = 220, label = "NAQI" }: { value: number | null; category: Snapshot["aqi"]["category"]; size?: number; label?: string }) {
  const reduce = useReducedMotion();
  const color = category ? CATEGORY_COLORS[category.key] : "#869B90";
  const r = size / 2 - 14;
  const circ = 2 * Math.PI * r;
  const arc = 0.75; // 270° gauge
  const frac = value == null ? 0 : Math.min(1, value / 500);
  const name = value == null ? `${label} unavailable` : `${label} ${value} out of 500${category ? `, ${category.label}` : ""}`;
  return (
    <div className="relative" style={{ width: size, height: size }} role="img" aria-label={name}>
      <div className="absolute inset-6 rounded-full blur-3xl" style={{ background: `${color}26` }} />
      <svg width={size} height={size} className="relative -rotate-[225deg]">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(124,231,180,0.08)" strokeWidth={12} strokeDasharray={`${circ * arc} ${circ}`} strokeLinecap="round" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={`${circ * arc} ${circ}`}
          initial={{ strokeDashoffset: circ * arc }}
          animate={{ strokeDashoffset: circ * arc * (1 - frac) }}
          transition={{ duration: reduce ? 0 : 1.4, ease: [0.22, 1, 0.36, 1] }}
          style={{ filter: `drop-shadow(0 0 10px ${color}80)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="label">{label}</span>
        <AnimatedNumber value={value} className="font-display text-6xl font-semibold leading-none tracking-tight" />
        <motion.span key={category?.key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-2 text-sm font-medium" style={{ color: category ? CATEGORY_TEXT_COLORS[category.key] : color }}>
          {category?.label ?? "Unavailable"}
        </motion.span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Pollutants */
const POLLUTANT_ORDER: PollutantKey[] = ["pm2_5", "pm10", "no2", "o3", "co", "so2"];

export function PollutantGrid({ snapshot }: { snapshot: Snapshot }) {
  const dominant = snapshot.aqi.dominant_pollutant;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {POLLUTANT_ORDER.map((k, i) => {
        const p = snapshot.pollutants[k];
        const sub = p.sub_index;
        const color = colorForAqi(sub);
        return (
          <motion.div
            key={k}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i }}
            className={cn("relative overflow-hidden rounded-xl border bg-black/15 p-3", k === dominant ? "border-mint/30" : "hairline")}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted">{p.label}</span>
              {k === dominant && <Badge color="#7CE7B4">main</Badge>}
            </div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <AnimatedNumber value={p.value} digits={k === "co" ? 2 : 0} className="font-display text-xl font-semibold" />
              <span className="text-[10px] text-faint">{p.unit}</span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/5" aria-hidden="true">
              <motion.div className="h-full rounded-full" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${Math.min(100, ((sub ?? 0) / 500) * 100)}%` }} transition={{ duration: 1, delay: 0.1 + 0.05 * i }} />
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-faint">
              <span>sub-index {sub ?? "—"}</span>
              {p.average && p.average.period_hours > 1 && <span>{p.average.period_hours}h avg {fmtNum(p.average.value, k === "co" ? 2 : 0)}</span>}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ Freshness & provenance */
export function FreshnessPill({ snapshot }: { snapshot: Snapshot }) {
  const s = snapshot.freshness.status;
  const map = {
    fresh: { c: "#35D399", t: "Fresh" },
    aging: { c: "#FACC15", t: "Aging" },
    stale: { c: "#FB923C", t: "Stale" },
    unknown: { c: "#94A89D", t: "Unknown age" },
    demo: { c: "#A78BFA", t: "Sample data" },
  }[s];
  return (
    <Badge color={map.c} dot>
      {map.t}
      {snapshot.freshness.age_minutes != null && <span className="text-faint">· {snapshot.freshness.age_minutes} min</span>}
    </Badge>
  );
}

export function Provenance({ snapshot, compact }: { snapshot: Snapshot; compact?: boolean }) {
  const src = snapshot.sources.air;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted", compact && "gap-x-3")}>
      <span className="inline-flex items-center gap-1.5">
        <Database aria-hidden="true" className="h-3.5 w-3.5 text-cyan" />
        {src.url ? (
          <a href={src.url} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-ink">
            {src.name}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : (
          src.name
        )}
      </span>
      <span>
        Observed {snapshot.observed_local?.replace("T", " ") ?? "—"} ({snapshot.utc_offset})
      </span>
      {!compact && <span>Fetched {timeAgo(snapshot.fetched_at)}</span>}
      <span>
        {snapshot.location.name} · {snapshot.location.lat.toFixed(3)}, {snapshot.location.lon.toFixed(3)}
      </span>
      {src.type === "model" && !compact && <Badge color="#55D6E8">model estimate · not a monitor reading</Badge>}
    </div>
  );
}

export function DemoBanner() {
  return (
    <motion.div role="note" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-4 flex items-center gap-3 rounded-xl border border-violet/30 bg-violet/10 px-4 py-2.5 text-sm text-violet-100">
      <FlaskConical aria-hidden="true" className="h-4 w-4 shrink-0 text-violet" />
      <span>
        <strong className="font-semibold">Sample data.</strong> Live providers are unreachable, so you are viewing an illustrative dataset. Do not use it for decisions.
      </span>
    </motion.div>
  );
}

export function StaleBanner({ snapshot }: { snapshot: Snapshot }) {
  if (snapshot.status !== "stale") return null;
  return (
    <div role="note" className="mb-4 flex items-center gap-3 rounded-xl border border-orange-400/30 bg-orange-400/10 px-4 py-2.5 text-sm text-orange-100">
      <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0 text-orange-300" />
      <span>
        Showing the last stored reading from {absoluteTime(snapshot.observed_at)}. {snapshot.errors.map((e) => e.provider).join(", ") || "Live providers"} did not respond.
      </span>
    </div>
  );
}

export function DataUnavailable({ message, onDemo, onRetry, headingLevel = "h1" }: { message: string; onDemo?: () => void; onRetry?: () => void; headingLevel?: "h1" | "h2" }) {
  const Heading = headingLevel;
  return (
    <div role="alert" className="glass mx-auto my-10 max-w-xl rounded-2xl p-8 text-center">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-orange-400/25 bg-orange-400/10 text-orange-300">
        <CloudFog aria-hidden="true" className="h-6 w-6" />
      </div>
      <Heading className="font-display text-lg font-semibold">Live environmental data is unavailable</Heading>
      <p className="mt-2 text-sm text-muted">{message}</p>
      <p className="mt-2 text-xs text-faint">AIRenv never fills gaps with invented readings. You can retry, or explore the interface with clearly labelled sample data.</p>
      <div className="mt-5 flex justify-center gap-2">
        {onRetry && (
          <Button variant="outline" onClick={onRetry}>
            Retry
          </Button>
        )}
        {onDemo && (
          <Button variant="ai" onClick={onDemo} icon={<FlaskConical aria-hidden="true" className="h-4 w-4" />}>
            View sample data
          </Button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Weather */
export function WeatherStrip({ snapshot }: { snapshot: Snapshot }) {
  const w = snapshot.weather;
  const items: { icon: ReactNode; label: string; value: ReactNode }[] = [
    { icon: <Thermometer aria-hidden="true" className="h-4 w-4" />, label: "Temperature", value: w ? `${fmtNum(w.temperature_c, 1)} °C` : "—" },
    { icon: <Droplets aria-hidden="true" className="h-4 w-4" />, label: "Humidity", value: w ? `${fmtNum(w.humidity_pct)} %` : "—" },
    { icon: <Wind aria-hidden="true" className="h-4 w-4" />, label: "Wind", value: w ? `${fmtNum(w.wind_speed_kmh, 1)} km/h ${windDirection(w.wind_direction_deg)}` : "—" },
    { icon: <CloudFog aria-hidden="true" className="h-4 w-4" />, label: "Weather", value: w?.weather_text ?? "—" },
    { icon: <Gauge aria-hidden="true" className="h-4 w-4" />, label: "Mixing height", value: w?.boundary_layer_m != null ? `${fmtNum(w.boundary_layer_m)} m` : "—" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {items.map((it) => (
        <div key={it.label} className="rounded-xl border hairline bg-black/15 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-muted">
            {it.icon}
            <span className="text-[11px]">{it.label}</span>
          </div>
          <div className="mt-1 text-sm font-medium">{it.value}</div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ Trend indicator */
export function TrendIndicator({ direction, change, label }: { direction: string; change: number | null | undefined; label?: string }) {
  const map: Record<string, { icon: ReactNode; c: string; t: string }> = {
    rising: { icon: <ArrowUpRight aria-hidden="true" className="h-4 w-4" />, c: "#FB923C", t: "Rising" },
    worsening: { icon: <ArrowUpRight aria-hidden="true" className="h-4 w-4" />, c: "#FB923C", t: "Worsening" },
    falling: { icon: <ArrowDownRight aria-hidden="true" className="h-4 w-4" />, c: "#35D399", t: "Falling" },
    improving: { icon: <ArrowDownRight aria-hidden="true" className="h-4 w-4" />, c: "#35D399", t: "Improving" },
    steady: { icon: <Minus aria-hidden="true" className="h-4 w-4" />, c: "#94A89D", t: "Steady" },
    similar: { icon: <ArrowRight aria-hidden="true" className="h-4 w-4" />, c: "#94A89D", t: "Similar" },
    unknown: { icon: <Minus aria-hidden="true" className="h-4 w-4" />, c: "#869B90", t: "Unknown" },
  };
  const m = map[direction] ?? map.unknown;
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: `${m.c}18`, color: m.c }}>
        {m.icon}
      </span>
      <div>
        <div className="text-sm font-medium" style={{ color: m.c }}>
          {m.t}
          {change != null && <span className="ml-1 text-xs text-muted">({change > 0 ? "+" : ""}{change}%)</span>}
        </div>
        {label && <div className="text-[11px] text-faint">{label}</div>}
      </div>
    </div>
  );
}

export function ConfidenceMeter({ level, score }: { level: "high" | "medium" | "low"; score?: number }) {
  const c = { high: "#35D399", medium: "#FACC15", low: "#FB923C" }[level];
  const bars = { high: 3, medium: 2, low: 1 }[level];
  return (
    <span className="inline-flex items-center gap-2 text-xs" title={score != null ? `score ${score}` : undefined}>
      <span className="flex items-end gap-0.5" aria-hidden="true">
        {[1, 2, 3].map((b) => (
          <span key={b} className="w-1 rounded-sm" style={{ height: 4 + b * 3, background: b <= bars ? c : "rgba(124,231,180,0.15)" }} />
        ))}
      </span>
      <span style={{ color: c }} className="capitalize">
        {level} confidence
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ Recommendation card */
const REC_FIELDS: { key: keyof Recommendation; label: string }[] = [
  { key: "what_is_happening", label: "What is happening" },
  { key: "why_it_matters", label: "Why it matters" },
  { key: "action", label: "Recommended action" },
  { key: "alternative", label: "Alternative" },
  { key: "expected_benefit", label: "Expected benefit" },
];
const BENEFIT_LABEL = { exposure: "Exposure", emissions: "Emissions", qualitative: "Qualitative" };

export function RecommendationCard({ rec, defaultOpen = false, index = 0 }: { rec: Recommendation; defaultOpen?: boolean; index?: number }) {
  const [open, setOpen] = useState(defaultOpen);
  const detailsId = `rec-details-${useId().replace(/:/g, "")}`;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.4 }}
      className="overflow-hidden rounded-xl border hairline bg-black/20"
    >
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-start gap-3 p-4 text-left" aria-expanded={open} aria-controls={detailsId}>
        <span aria-hidden="true" className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-cyan/20 to-violet/20 text-cyan">
          <Sparkles aria-hidden="true" className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{rec.title}</span>
          <span className="mt-1 block text-xs leading-relaxed text-muted">{rec.action}</span>
          <span className="mt-2 flex flex-wrap items-center gap-2">
            <ConfidenceMeter level={rec.confidence.level} />
            <Badge color={rec.benefit_type === "emissions" ? "#55D6E8" : rec.benefit_type === "exposure" ? "#7CE7B4" : "#94A89D"}>{BENEFIT_LABEL[rec.benefit_type]} benefit</Badge>
          </span>
        </span>
        <motion.span aria-hidden="true" animate={{ rotate: open ? 180 : 0 }} className="mt-1 text-muted">
          <ChevronDown aria-hidden="true" className="h-4 w-4" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={detailsId} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }}>
            <div className="space-y-3 border-t hairline px-4 pb-4 pt-3">
              {REC_FIELDS.map((f) => (
                <div key={f.key}>
                  <div className="label !text-[10px]">{f.label}</div>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-ink/90">{rec[f.key] as string}</p>
                </div>
              ))}
              <div>
                <div className="label !text-[10px]">Confidence</div>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink/90">{rec.confidence.reason}</p>
              </div>
              {rec.data_refs.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {rec.data_refs.map((d, i) => (
                    <span key={i} className="rounded-md border hairline bg-white/[0.02] px-2 py-1 font-mono text-[10px] text-muted" title={`${d.source ?? ""} · ${d.observed_at ?? ""}`}>
                      {d.label}: <span className="text-ink">{d.value ?? "—"}</span> {d.unit}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ Feed */
const FEED_ICONS: Record<string, ReactNode> = {
  monitoring_started: <Radio aria-hidden="true" className="h-3.5 w-3.5" />,
  category_change: <Activity aria-hidden="true" className="h-3.5 w-3.5" />,
  pollution_increase: <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />,
  forecast_deterioration: <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />,
  poor_dispersion: <Wind aria-hidden="true" className="h-3.5 w-3.5" />,
  event_risk: <Bell aria-hidden="true" className="h-3.5 w-3.5" />,
  source_unavailable: <CloudFog aria-hidden="true" className="h-3.5 w-3.5" />,
  source_recovered: <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />,
  recommendation: <Brain aria-hidden="true" className="h-3.5 w-3.5" />,
};

export function FeedList({ items, max = 8, live = false, label = "Intelligence feed" }: { items: FeedItem[]; max?: number; live?: boolean; label?: string }) {
  return (
    <div className="relative">
      <span className="absolute bottom-2 left-[15px] top-2 w-px bg-gradient-to-b from-mint/30 via-mint/10 to-transparent" aria-hidden="true" />
    <ol className="relative space-y-1" aria-label={label} aria-live={live ? "polite" : undefined} aria-relevant={live ? "additions" : undefined}>
      <AnimatePresence initial={false}>
        {items.slice(0, max).map((it) => {
          const c = SEVERITY_COLORS[it.severity] ?? "#55D6E8";
          return (
            <motion.li key={it.id} layout initial={{ opacity: 0, x: -12, height: 0 }} animate={{ opacity: 1, x: 0, height: "auto" }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} className="relative flex gap-3 rounded-lg py-2 pr-2">
              <span aria-hidden="true" className="relative z-10 mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border" style={{ color: c, borderColor: `${c}40`, background: "#0B1914" }}>
                {FEED_ICONS[it.type] ?? <Leaf aria-hidden="true" className="h-3.5 w-3.5" />}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[13px] font-medium">
                    <span className="sr-only">{SEVERITY_LABEL[it.severity] ?? "Info"} severity: </span>
                    {it.title}
                  </span>
                  <span className="text-[10px] text-faint">{timeAgo(it.created_at)}</span>
                </div>
                {it.detail && <p className="mt-0.5 text-xs leading-relaxed text-muted">{it.detail}</p>}
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
    </div>
  );
}

export function ExternalSource({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan hover:underline">
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
      <ExternalLink aria-hidden="true" className="h-3 w-3" />
    </a>
  );
}
