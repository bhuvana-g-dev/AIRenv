import { motion } from "motion/react";
import { Activity, BarChart3, Brain, CloudSun, Clock, Gauge, Radio, ShieldCheck, Sparkles, Wind } from "lucide-react";
import { useState } from "react";
import { DailyBars, HourProfile, METRIC_LABEL, TrendChart, type Metric } from "../components/charts";
import {
  AqiGauge,
  ConfidenceMeter,
  DataUnavailable,
  DemoBanner,
  FeedList,
  FreshnessPill,
  PollutantGrid,
  Provenance,
  RecommendationCard,
  StaleBanner,
  TrendIndicator,
  WeatherStrip,
} from "../components/env";
import { Badge, Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, Tabs } from "../components/ui";
import { ApiError } from "../lib/api";
import { CATEGORY_COLORS } from "../lib/aqi";
import { fmtNum, pct } from "../lib/format";
import { useBriefing, useBundle, useFeed, useHistory } from "../lib/queries";
import { useApp } from "../lib/store";
import type { Bundle } from "../lib/types";

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-80" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-[340px]" />
        <Skeleton className="h-[340px]" />
        <Skeleton className="h-[340px]" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

function StatusCard({ bundle }: { bundle: Bundle }) {
  const a = bundle.snapshot.analysis;
  const sevColor: Record<string, string> = { low: "#35D399", moderate: "#FACC15", elevated: "#FB923C", high: "#EF4444", severe: "#C0264F", unknown: "#94A89D" };
  return (
    <Card delay={0.1}>
      <CardHeader icon={<Activity className="h-4 w-4" />} title="Environmental status" subtitle="Deterministic analysis of the latest data" />
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">Severity</span>
          <Badge color={sevColor[a.severity]} dot>
            <span className="capitalize">{a.severity}</span>
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border hairline bg-black/15 p-3">
            <p className="mb-2 text-[11px] text-muted">PM2.5 trend · last {a.trend_pm2_5.window_hours}h</p>
            <TrendIndicator direction={a.trend_pm2_5.direction} change={a.trend_pm2_5.change_pct} />
          </div>
          <div className="rounded-xl border hairline bg-black/15 p-3">
            <p className="mb-2 text-[11px] text-muted">Forecast · next 12h</p>
            <TrendIndicator direction={a.outlook_12h.direction} change={a.outlook_12h.change_pct} label={a.outlook_12h.peak != null ? `peak ${fmtNum(a.outlook_12h.peak)} µg/m³` : undefined} />
          </div>
        </div>
        <div className="rounded-xl border hairline bg-black/15 p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] text-muted">
              <Wind className="h-3.5 w-3.5" /> Dispersion
            </span>
            <span className="text-xs font-medium capitalize" style={{ color: { poor: "#FB923C", limited: "#FACC15", moderate: "#7CE7B4", good: "#35D399" }[a.dispersion.level] ?? "#94A89D" }}>
              {a.dispersion.level}
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">{a.dispersion.explanation}</p>
        </div>
        <div className="rounded-xl border hairline bg-black/15 p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] text-muted">
              <ShieldCheck className="h-3.5 w-3.5" /> Data confidence
            </span>
            <ConfidenceMeter level={a.confidence.level} score={a.confidence.score} />
          </div>
          <ul className="mt-1.5 space-y-1 text-xs text-muted">
            {a.confidence.reasons.map((r) => (
              <li key={r}>· {r}</li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

function BriefingCard() {
  const briefing = useBriefing();
  return (
    <Card delay={0.15} className="lg:col-span-2">
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan/[0.06] via-transparent to-violet/[0.06]" />
      <CardHeader
        icon={<Brain className="h-4 w-4 text-cyan" />}
        title={<span className="text-gradient-ai">AI intelligence briefing</span>}
        subtitle="Rules decide and calculate; AI explains. Every figure comes from the data shown."
        action={
          briefing.data && (
            <Badge color={briefing.data.generated_by === "gemini" ? "#A78BFA" : "#94A89D"}>
              {briefing.data.generated_by === "gemini" ? "Gemini" : briefing.data.ai_available ? "Rules (AI fallback)" : "Rule engine"}
            </Badge>
          )
        }
      />
      {briefing.isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-16" />
          <Skeleton className="h-20" />
        </div>
      )}
      {briefing.isError && <ErrorState title="Briefing unavailable" message={(briefing.error as Error).message} />}
      {briefing.data && (
        <div className="relative">
          <motion.h2 key={briefing.data.headline} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="font-display text-xl font-semibold tracking-tight">
            {briefing.data.headline}
          </motion.h2>
          <p className="mt-2 text-sm leading-relaxed text-ink/85">{briefing.data.summary}</p>
          {briefing.data.key_points.length > 0 && (
            <ul className="mt-3 grid gap-1.5 md:grid-cols-2">
              {briefing.data.key_points.map((k) => (
                <li key={k} className="flex gap-2 text-xs leading-relaxed text-muted">
                  <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-cyan" />
                  {k}
                </li>
              ))}
            </ul>
          )}
          {briefing.data.ai_note && <p className="mt-2 text-[11px] text-faint">{briefing.data.ai_note}</p>}
          <div className="mt-5 space-y-2.5">
            {briefing.data.recommendations.length === 0 ? (
              <EmptyState title="No actions needed right now" description="Conditions don't call for changes. AIRenv keeps monitoring and will alert you if that changes." />
            ) : (
              briefing.data.recommendations.slice(0, 5).map((r, i) => <RecommendationCard key={r.id} rec={r} index={i} defaultOpen={i === 0} />)
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function HistoryCard() {
  const history = useHistory();
  if (history.isLoading) return <Skeleton className="h-[360px]" />;
  if (history.isError || !history.data) return <Card><ErrorState title="History unavailable" message={(history.error as Error)?.message} /></Card>;
  const c = history.data.comparisons;
  const cleanest = c.typically_cleanest_daytime_hours.map((h) => h.hour);
  return (
    <Card delay={0.2} className="lg:col-span-2">
      <CardHeader icon={<BarChart3 className="h-4 w-4" />} title="Historical comparison" subtitle={c.basis} />
      <div className="mb-4 grid grid-cols-3 gap-3">
        {[
          { l: "vs yesterday, same hour", v: c.vs_yesterday_same_hour.change_pct, s: c.vs_yesterday_same_hour.value },
          { l: "vs 7 days ago, same hour", v: c.vs_week_ago_same_hour.change_pct, s: c.vs_week_ago_same_hour.value },
          { l: "vs 7-day mean", v: c.vs_seven_day_mean_pct, s: c.seven_day_mean },
        ].map((x) => (
          <div key={x.l} className="rounded-xl border hairline bg-black/15 p-3">
            <p className="text-[11px] text-muted">{x.l}</p>
            <p className="mt-1 font-display text-xl font-semibold" style={{ color: x.v == null ? undefined : x.v > 0 ? "#FB923C" : "#35D399" }}>
              {pct(x.v)}
            </p>
            <p className="text-[10px] text-faint">PM2.5 then: {fmtNum(x.s)} µg/m³</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-1 text-xs text-muted">Daily mean PM2.5</p>
          <DailyBars rows={c.daily} />
        </div>
        <div>
          <p className="mb-1 text-xs text-muted">
            Average by hour of day <span className="text-mint">· cleanest daytime hours highlighted</span>
          </p>
          <HourProfile rows={c.hour_of_day_profile} highlight={cleanest} />
        </div>
      </div>
      <p className="mt-2 text-[11px] text-faint">AIRenv has also recorded {history.data.recorded.length} hourly snapshots for this location through scheduled refreshes.</p>
    </Card>
  );
}

function FeedCard() {
  const feed = useFeed();
  return (
    <Card delay={0.25}>
      <CardHeader
        icon={<Radio className="h-4 w-4" />}
        title="Live intelligence feed"
        subtitle="Events detected by AIRenv's background processing"
        action={
          <span className="relative mt-1 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald" />
          </span>
        }
      />
      {feed.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : feed.data && feed.data.items.length > 0 ? (
        <div className="max-h-[420px] overflow-y-auto pr-1">
          <FeedList items={feed.data.items} max={20} />
        </div>
      ) : (
        <EmptyState icon={<Clock className="h-5 w-5" />} title="Waiting for the first scheduled check" description="Events appear here as the scheduler detects changes: category shifts, rising pollution, forecast deterioration and community event risks." />
      )}
    </Card>
  );
}

export default function Dashboard() {
  const bundle = useBundle();
  const setDemo = useApp((s) => s.setDemo);
  const demo = useApp((s) => s.demo);
  const [metric, setMetric] = useState<Metric>("aqi_in");
  const [range, setRange] = useState<"near" | "week">("near");

  if (bundle.isLoading) return <DashboardSkeleton />;
  if (bundle.isError || !bundle.data) {
    const err = bundle.error as ApiError;
    return <DataUnavailable message={err?.message ?? "Unknown error"} onRetry={() => bundle.refetch()} onDemo={() => setDemo(true)} />;
  }
  const { snapshot, series } = bundle.data;
  const cat = snapshot.aqi.category;

  return (
    <div>
      {(demo || snapshot.is_demo) && <DemoBanner />}
      <StaleBanner snapshot={snapshot} />
      <PageHeader
        eyebrow="Intelligence dashboard"
        title={<>Air around <span className="text-gradient">{snapshot.location.name}</span></>}
        description={<Provenance snapshot={snapshot} />}
        actions={<FreshnessPill snapshot={snapshot} />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden">
          <div className="pointer-events-none absolute inset-0 opacity-60" style={{ background: `radial-gradient(600px circle at 50% 0%, ${cat ? CATEGORY_COLORS[cat.key] : "#5F7469"}1f, transparent 60%)` }} />
          <CardHeader icon={<Gauge className="h-4 w-4" />} title="Current air quality" subtitle="Indian National AQI, estimated" />
          <div className="relative flex flex-col items-center">
            <AqiGauge value={snapshot.aqi.value} category={cat} />
            <p className="mt-3 text-center text-xs leading-relaxed text-muted">{cat?.health}</p>
            <p className="mt-1 text-[10px] text-faint">{snapshot.analysis.health_source}</p>
            <div className="mt-4 grid w-full grid-cols-2 gap-2 text-center">
              <div className="rounded-xl border hairline bg-black/15 p-2.5">
                <p className="text-[10px] text-muted">Main pollutant</p>
                <p className="text-sm font-semibold">{snapshot.aqi.dominant_label ?? "—"}</p>
              </div>
              <div className="rounded-xl border hairline bg-black/15 p-2.5" title="US EPA AQI from the provider, for reference">
                <p className="text-[10px] text-muted">US AQI (reference)</p>
                <p className="text-sm font-semibold">{fmtNum(snapshot.us_aqi)}</p>
              </div>
            </div>
            {snapshot.aqi.method_note && <p className="mt-3 text-[10px] leading-relaxed text-faint">{snapshot.aqi.method_note}</p>}
          </div>
        </Card>

        <Card delay={0.05}>
          <CardHeader icon={<CloudSun className="h-4 w-4" />} title="Pollutants & weather" subtitle="Current hourly values · bars show CPCB sub-index" />
          <PollutantGrid snapshot={snapshot} />
          <div className="mt-4">
            <WeatherStrip snapshot={snapshot} />
          </div>
          {snapshot.sources.weather && <p className="mt-2 text-[10px] text-faint">Weather: {snapshot.sources.weather.name}</p>}
        </Card>

        <StatusCard bundle={bundle.data} />

        <BriefingCard />
        <FeedCard />

        <Card delay={0.2} className="lg:col-span-3">
          <CardHeader
            icon={<Activity className="h-4 w-4" />}
            title="Pollution trend & forecast"
            subtitle={<>Solid: model history · dashed violet: model forecast (uncertain) · {METRIC_LABEL[metric].label}</>}
            action={
              <div className="flex flex-wrap justify-end gap-2">
                <Tabs layoutId="metric" value={metric} onChange={setMetric} tabs={[{ value: "aqi_in", label: "NAQI" }, { value: "pm2_5", label: "PM2.5" }, { value: "pm10", label: "PM10" }, { value: "no2", label: "NO₂" }]} />
                <Tabs layoutId="range" value={range} onChange={setRange} tabs={[{ value: "near", label: "48h + 3d" }, { value: "week", label: "7 days" }]} />
              </div>
            }
          />
          <TrendChart series={series} metric={metric} pastHours={range === "near" ? 48 : 24 * 7} futureHours={range === "near" ? 72 : 24} height={300} />
        </Card>

        <HistoryCard />
        <BestWindowsCard bundle={bundle.data} />
      </div>
    </div>
  );
}

function BestWindowsCard({ bundle }: { bundle: Bundle }) {
  const { series } = bundle;
  const ni = series.now_index;
  const pm = series.hourly.pm2_5;
  const cands: { i: number; mean: number }[] = [];
  for (let i = ni; i < Math.min(series.times.length - 2, ni + 36); i++) {
    const h = Number(series.times[i].slice(11, 13));
    if (h < 6 || h + 2 > 21) continue;
    const a = pm[i];
    const b = pm[i + 1];
    if (a == null || b == null) continue;
    cands.push({ i, mean: (a + b) / 2 });
  }
  cands.sort((x, y) => x.mean - y.mean);
  const chosen: typeof cands = [];
  for (const c of cands) {
    if (chosen.every((o) => Math.abs(o.i - c.i) >= 2)) chosen.push(c);
    if (chosen.length === 3) break;
  }
  const worst = cands.length ? cands[cands.length - 1] : null;
  return (
    <Card delay={0.25}>
      <CardHeader icon={<Clock className="h-4 w-4" />} title="Cleaner windows ahead" subtitle="Lowest forecast PM2.5 for a 2-hour daytime activity, next 36 h" />
      {chosen.length === 0 ? (
        <EmptyState title="No daytime forecast hours available" />
      ) : (
        <ol className="space-y-2">
          {chosen.map((c, idx) => (
            <motion.li key={c.i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.08 }} className="flex items-center justify-between rounded-xl border hairline bg-black/15 px-3 py-2.5">
              <span className="flex items-center gap-3">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald/15 font-mono text-xs text-mint">{idx + 1}</span>
                <span className="text-sm">
                  {new Date(series.times[c.i].slice(0, 10) + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short" })} {series.times[c.i].slice(11, 16)}–{series.times[c.i + 2]?.slice(11, 16)}
                </span>
              </span>
              <span className="text-xs text-muted">~{fmtNum(c.mean)} µg/m³</span>
            </motion.li>
          ))}
        </ol>
      )}
      {worst && <p className="mt-3 text-[11px] text-faint">Highest daytime 2-hour window in this period: ~{fmtNum(worst.mean)} µg/m³ at {series.times[worst.i].slice(11, 16)}. Forecasts are estimates.</p>}
    </Card>
  );
}
