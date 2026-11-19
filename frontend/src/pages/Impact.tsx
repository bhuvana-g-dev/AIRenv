import { useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Bike, Calculator, Car, Info, Leaf, ShieldCheck, Users, Wind, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DemoBanner } from "../components/env";
import { AnimatedNumber, Badge, Card, CardHeader, EmptyState, Field, PageHeader, Skeleton, Tabs } from "../components/ui";
import { api, post } from "../lib/api";
import { colorForPm25 } from "../lib/aqi";
import { fmtNum, localDayHour } from "../lib/format";
import { useBundle } from "../lib/queries";
import { useApp } from "../lib/store";
import type { CommunityStats } from "../lib/types";

interface Dose {
  start: string;
  mean_pm2_5: number;
  inhaled_ug: number;
  sub_index: number;
}
interface ExposureResult {
  planned: Dose | null;
  alternatives: Dose[];
  best: Dose | null;
  reduction_pct: number | null;
  inhalation_rate_m3_per_h: number;
  assumptions: string[];
  sources: string[];
  uncertainty: string;
  forecast: { time: string; pm2_5: number | null }[];
  is_demo: boolean;
}
interface Band {
  estimate: number;
  low: number;
  high: number;
}
interface TripResult {
  km_per_week: number;
  baseline_kg_per_week: number;
  alternative_kg_per_week: number;
  avoided_kg: { week: Band; month: Band; year: Band };
  methodology: string[];
  source: string;
}
interface EnergyResult {
  electricity_kg_per_month: number;
  lpg_kg_per_month: number;
  total_kg_per_month: Band;
  total_kg_per_year: number;
  methodology: string[];
}
interface Factors {
  transport: Record<string, { label: string; kg_per_km: number; per: string }>;
  transport_source: string;
}

function Assumptions({ items, title = "Assumptions & method" }: { items: string[]; title?: string }) {
  return (
    <div className="rounded-xl border hairline bg-black/15 p-3.5">
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted">
        <Info className="h-3.5 w-3.5" /> {title}
      </p>
      <ul className="space-y-1 text-[11px] leading-relaxed text-muted">
        {items.map((a) => (
          <li key={a}>· {a}</li>
        ))}
      </ul>
    </div>
  );
}

function ExposureTab() {
  const location = useApp((s) => s.location);
  const demo = useApp((s) => s.demo);
  const bundle = useBundle();
  const [hours, setHours] = useState(1);
  const [intensity, setIntensity] = useState("moderate");
  const [planned, setPlanned] = useState<string>("");
  const options = useMemo(() => {
    const s = bundle.data?.series;
    if (!s) return [];
    return s.times.slice(s.now_index, s.now_index + 48).filter((t) => {
      const h = Number(t.slice(11, 13));
      return h >= 5 && h <= 21;
    });
  }, [bundle.data]);
  useEffect(() => {
    if (!planned && options.length) setPlanned(options.find((t) => t.slice(11, 13) === "08") ?? options[0]);
  }, [options, planned]);

  const m = useMutation({
    mutationFn: () => post<ExposureResult>("/api/impact/exposure", { lat: location.lat, lon: location.lon, activity_hours: hours, intensity, planned_start: planned, demo }),
  });
  useEffect(() => {
    if (planned) m.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planned, hours, intensity, location.lat, location.lon]);
  const r = m.data;
  const bars = r && r.planned && r.best ? [{ name: "Planned", v: r.planned.inhaled_ug, c: colorForPm25(r.planned.mean_pm2_5) }, { name: "Best window", v: r.best.inhaled_ug, c: "#35D399" }] : [];

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <Card hover={false}>
        <CardHeader icon={<ShieldCheck className="h-4 w-4" />} title="Personal exposure" subtitle="Compare an activity at different times" />
        <div className="space-y-3">
          <Field label="Planned start (forecast hours)">
            <select className="input" value={planned} onChange={(e) => setPlanned(e.target.value)}>
              {options.map((t) => (
                <option key={t} value={t}>
                  {localDayHour(t)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Activity intensity">
            <select className="input" value={intensity} onChange={(e) => setIntensity(e.target.value)}>
              <option value="sedentary">Sedentary (sitting outdoors)</option>
              <option value="light">Light (slow walk)</option>
              <option value="moderate">Moderate (brisk walk, play)</option>
              <option value="high">High (running, sports)</option>
            </select>
          </Field>
          <Field label={`Duration: ${hours} h`}>
            <input type="range" min={1} max={4} step={1} value={hours} onChange={(e) => setHours(Number(e.target.value))} className="w-full accent-emerald-400" />
          </Field>
        </div>
        {r && <div className="mt-4"><Assumptions items={r.assumptions} /></div>}
      </Card>
      <div className="space-y-4">
        {m.isPending && !r ? (
          <Skeleton className="h-80" />
        ) : m.isError ? (
          <Card hover={false}><EmptyState title="Exposure estimate unavailable" description={(m.error as Error).message} /></Card>
        ) : r ? (
          <>
            {r.is_demo && <DemoBanner />}
            <div className="grid gap-4 md:grid-cols-3">
              <Card hover={false}>
                <p className="text-xs text-muted">Estimated inhaled PM2.5 at planned time</p>
                <p className="mt-2 font-display text-3xl font-semibold">
                  <AnimatedNumber value={r.planned?.inhaled_ug ?? null} digits={0} /> <span className="text-sm text-faint">µg</span>
                </p>
                <p className="text-[11px] text-faint">mean {fmtNum(r.planned?.mean_pm2_5)} µg/m³ · {r.inhalation_rate_m3_per_h} m³/h</p>
              </Card>
              <Card hover={false}>
                <p className="text-xs text-muted">At the cleanest window ({r.best ? localDayHour(r.best.start) : "—"})</p>
                <p className="mt-2 font-display text-3xl font-semibold text-mint">
                  <AnimatedNumber value={r.best?.inhaled_ug ?? null} digits={0} /> <span className="text-sm text-faint">µg</span>
                </p>
                <p className="text-[11px] text-faint">mean {fmtNum(r.best?.mean_pm2_5)} µg/m³</p>
              </Card>
              <Card hover={false}>
                <p className="text-xs text-muted">Estimated exposure reduction</p>
                <p className="mt-2 font-display text-3xl font-semibold" style={{ color: (r.reduction_pct ?? 0) > 0 ? "#35D399" : "#94A89D" }}>
                  {r.reduction_pct != null && r.reduction_pct > 0 ? <><AnimatedNumber value={r.reduction_pct} />%</> : "—"}
                </p>
                <p className="text-[11px] text-faint">{(r.reduction_pct ?? 0) > 0 ? "by shifting the activity" : "planned time is already among the cleaner hours"}</p>
              </Card>
            </div>
            <Card hover={false}>
              <CardHeader title="Forecast PM2.5 & activity windows" subtitle="Orange: planned window · green: cleanest window · model forecast" />
              <div className="h-64">
                <ResponsiveContainer>
                  <AreaChart data={r.forecast} margin={{ left: -16, right: 6, top: 6 }}>
                    <defs>
                      <linearGradient id="exp-g" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0" stopColor="#55D6E8" stopOpacity={0.4} />
                        <stop offset="1" stopColor="#55D6E8" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(124,231,180,0.06)" vertical={false} />
                    <XAxis dataKey="time" tickFormatter={(t: string) => t.slice(11, 16)} interval={5} tick={{ fill: "#5F7469", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#5F7469", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip labelFormatter={(t) => localDayHour(String(t))} contentStyle={{ background: "#10231B", border: "1px solid rgba(124,231,180,0.15)", borderRadius: 12, fontSize: 12 }} formatter={(v) => [`${v} µg/m³`, "PM2.5"]} />
                    {r.planned && <ReferenceArea x1={r.planned.start} x2={r.forecast[Math.min(r.forecast.findIndex((f) => f.time === r.planned!.start) + hours, r.forecast.length - 1)]?.time} fill="#FB923C" fillOpacity={0.15} />}
                    {r.best && <ReferenceArea x1={r.best.start} x2={r.forecast[Math.min(r.forecast.findIndex((f) => f.time === r.best!.start) + hours, r.forecast.length - 1)]?.time} fill="#35D399" fillOpacity={0.18} />}
                    <Area type="monotone" dataKey="pm2_5" stroke="#55D6E8" strokeWidth={2} fill="url(#exp-g)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="h-28">
                  <ResponsiveContainer>
                    <BarChart data={bars} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" tick={{ fill: "#94A89D", fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
                      <Tooltip formatter={(v) => [`${v} µg`, "Inhaled PM2.5"]} contentStyle={{ background: "#10231B", border: "1px solid rgba(124,231,180,0.15)", borderRadius: 12, fontSize: 12 }} />
                      <Bar dataKey="v" radius={[0, 8, 8, 0]}>
                        {bars.map((b) => (
                          <Cell key={b.name} fill={b.c} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <p className="mb-1.5 text-xs text-muted">Cleanest daytime windows (next 48 h)</p>
                  <ul className="space-y-1">
                    {r.alternatives.map((a) => (
                      <li key={a.start} className="flex justify-between rounded-lg bg-black/15 px-2.5 py-1.5 text-xs">
                        <span>{localDayHour(a.start)}</span>
                        <span className="text-muted">{fmtNum(a.mean_pm2_5)} µg/m³ · {fmtNum(a.inhaled_ug)} µg</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-faint">{r.uncertainty} Sources: {r.sources.join("; ")}.</p>
            </Card>
          </>
        ) : null}
      </div>
    </div>
  );
}

function EmissionsTab() {
  const factors = useQuery({ queryKey: ["factors"], queryFn: () => api<Factors>("/api/impact/factors"), staleTime: Infinity });
  const [trip, setTrip] = useState({ baseline_mode: "petrol_car", alternative_mode: "metro", distance_km: 10, trips_per_week: 10, baseline_occupants: 1, alternative_occupants: 1 });
  const [energy, setEnergy] = useState({ electricity_kwh_saved_per_month: 30, lpg_kg_saved_per_month: 0 });
  const t = useMutation({ mutationFn: () => post<TripResult>("/api/impact/trip", trip) });
  const e = useMutation({ mutationFn: () => post<EnergyResult>("/api/impact/energy", energy) });
  useEffect(() => {
    const id = setTimeout(() => t.mutate(), 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip]);
  useEffect(() => {
    const id = setTimeout(() => e.mutate(), 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [energy]);
  const modes = factors.data ? Object.entries(factors.data.transport) : [];
  const isCar = (m: string) => factors.data?.transport[m]?.per === "vehicle";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card hover={false}>
        <CardHeader icon={<Car className="h-4 w-4" />} title="Transport alternative" subtitle="Estimated CO₂e avoided by switching mode" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Current mode">
            <select className="input" value={trip.baseline_mode} onChange={(ev) => setTrip({ ...trip, baseline_mode: ev.target.value })}>
              {modes.map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
          <Field label="Alternative">
            <select className="input" value={trip.alternative_mode} onChange={(ev) => setTrip({ ...trip, alternative_mode: ev.target.value })}>
              {modes.map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
          <Field label="One-way distance (km)">
            <input type="number" min={1} max={500} className="input" value={trip.distance_km} onChange={(ev) => setTrip({ ...trip, distance_km: Math.max(0.1, Number(ev.target.value)) })} />
          </Field>
          <Field label="Trips per week">
            <input type="number" min={1} max={50} className="input" value={trip.trips_per_week} onChange={(ev) => setTrip({ ...trip, trips_per_week: Math.max(1, Number(ev.target.value)) })} />
          </Field>
          {isCar(trip.baseline_mode) && (
            <Field label="People in current vehicle">
              <input type="number" min={1} max={8} className="input" value={trip.baseline_occupants} onChange={(ev) => setTrip({ ...trip, baseline_occupants: Number(ev.target.value) })} />
            </Field>
          )}
          {isCar(trip.alternative_mode) && (
            <Field label="People sharing (carpool)">
              <input type="number" min={1} max={8} className="input" value={trip.alternative_occupants} onChange={(ev) => setTrip({ ...trip, alternative_occupants: Number(ev.target.value) })} />
            </Field>
          )}
        </div>
        {t.data && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {(["week", "month", "year"] as const).map((p) => (
                <div key={p} className="rounded-xl border hairline bg-black/15 p-3 text-center">
                  <p className="text-[11px] capitalize text-muted">per {p}</p>
                  <p className="font-display text-xl font-semibold text-cyan">
                    <AnimatedNumber value={t.data.avoided_kg[p].estimate} digits={1} />
                  </p>
                  <p className="text-[10px] text-faint">kg CO₂e · {fmtNum(t.data.avoided_kg[p].low, 1)}–{fmtNum(t.data.avoided_kg[p].high, 1)}</p>
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              {[
                { l: "Current", v: t.data.baseline_kg_per_week, c: "#FB923C" },
                { l: "Alternative", v: t.data.alternative_kg_per_week, c: "#35D399" },
              ].map((b) => (
                <div key={b.l} className="flex items-center gap-3 text-xs">
                  <span className="w-20 text-muted">{b.l}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/5">
                    <motion.div className="h-full rounded-full" style={{ background: b.c }} initial={{ width: 0 }} animate={{ width: `${(b.v / Math.max(t.data.baseline_kg_per_week, t.data.alternative_kg_per_week, 0.01)) * 100}%` }} transition={{ duration: 0.8 }} />
                  </div>
                  <span className="w-24 text-right tabular-nums">{fmtNum(b.v, 1)} kg/wk</span>
                </div>
              ))}
            </div>
            <Assumptions items={[...t.data.methodology, t.data.source]} title="Methodology & uncertainty" />
          </motion.div>
        )}
        {t.isError && <p className="mt-3 text-xs text-orange-300">{(t.error as Error).message}</p>}
      </Card>

      <Card hover={false}>
        <CardHeader icon={<Zap className="h-4 w-4" />} title="Energy alternative" subtitle="Estimated CO₂ from electricity or LPG saved" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Electricity saved (kWh / month)">
            <input type="number" min={0} className="input" value={energy.electricity_kwh_saved_per_month} onChange={(ev) => setEnergy({ ...energy, electricity_kwh_saved_per_month: Math.max(0, Number(ev.target.value)) })} />
          </Field>
          <Field label="LPG saved (kg / month)">
            <input type="number" min={0} className="input" value={energy.lpg_kg_saved_per_month} onChange={(ev) => setEnergy({ ...energy, lpg_kg_saved_per_month: Math.max(0, Number(ev.target.value)) })} />
          </Field>
        </div>
        {e.data && (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border hairline bg-black/15 p-3 text-center">
                <p className="text-[11px] text-muted">per month</p>
                <p className="font-display text-xl font-semibold text-cyan"><AnimatedNumber value={e.data.total_kg_per_month.estimate} digits={1} /></p>
                <p className="text-[10px] text-faint">kg CO₂ · {e.data.total_kg_per_month.low}–{e.data.total_kg_per_month.high}</p>
              </div>
              <div className="rounded-xl border hairline bg-black/15 p-3 text-center">
                <p className="text-[11px] text-muted">per year</p>
                <p className="font-display text-xl font-semibold text-cyan"><AnimatedNumber value={e.data.total_kg_per_year} digits={0} /></p>
                <p className="text-[10px] text-faint">kg CO₂ (estimate)</p>
              </div>
            </div>
            <Assumptions items={e.data.methodology} title="Methodology & uncertainty" />
          </div>
        )}
        <div className="mt-4 rounded-xl border border-cyan/20 bg-cyan/5 p-3 text-[11px] leading-relaxed text-muted">
          <Wind className="mb-1 h-3.5 w-3.5 text-cyan" />
          CO₂e is a greenhouse-gas measure. Lower CO₂e often comes with lower local exhaust, but these figures do not describe changes in PM2.5 or AQI near you.
        </div>
      </Card>
    </div>
  );
}

function CommunityTab() {
  const q = useQuery({
    queryKey: ["impact-community"],
    queryFn: () => api<{ communities: { id: string; name: string; type: string; is_demo: boolean; stats: CommunityStats }[]; open_burning_concerns_detected: number; disclaimer: string }>("/api/impact/community"),
  });
  if (q.isLoading) return <Skeleton className="h-72" />;
  if (q.isError) return <Card hover={false}><EmptyState title="Community impact unavailable" description={(q.error as Error).message} /></Card>;
  const data = q.data!;
  if (data.communities.length === 0)
    return (
      <Card hover={false}>
        <EmptyState icon={<Users className="h-5 w-5" />} title="No communities" description="Create or join a community on the Community page to see aggregated, verified actions here." />
      </Card>
    );
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/5 px-4 py-2.5 text-xs text-yellow-100">{data.disclaimer}</div>
      {data.communities.map((c) => (
        <Card key={c.id} hover={false}>
          <CardHeader icon={<Leaf className="h-4 w-4" />} title={<>{c.name} {c.is_demo && <Badge color="#A78BFA">demo</Badge>}</>} subtitle={`${c.stats.totals.verified_records} verified records · ${c.stats.totals.pending_records} pending`} />
          <div className="grid gap-4 md:grid-cols-[1fr_300px]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-muted">
                  <tr className="border-b hairline">
                    <th className="py-2 font-medium">Initiative</th>
                    <th className="py-2 font-medium">Verified participants</th>
                    <th className="py-2 font-medium">Verified quantity</th>
                    <th className="py-2 font-medium">Unverified</th>
                  </tr>
                </thead>
                <tbody>
                  {c.stats.by_type.map((r) => (
                    <tr key={r.type} className="border-b hairline last:border-0">
                      <td className="py-2">{r.label}</td>
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <span className="w-10 tabular-nums">{r.verified_participants}</span>
                          <motion.span className="h-1.5 rounded-full bg-emerald" initial={{ width: 0 }} animate={{ width: Math.min(120, r.verified_participants) }} />
                        </div>
                      </td>
                      <td className="py-2 tabular-nums">{fmtNum(r.verified_quantity)} {r.unit}</td>
                      <td className="py-2 text-faint">{r.unverified_participants}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[10px] text-faint">Measured: counts of verified actions recorded by administrators.</p>
            </div>
            <div className="rounded-xl border border-cyan/20 bg-cyan/5 p-4">
              <p className="text-[11px] text-muted">Estimated CO₂e avoided (verified transport records)</p>
              <p className="mt-1 font-display text-2xl font-semibold text-cyan">
                <AnimatedNumber value={c.stats.estimated_emissions_avoided.estimate_kg} digits={1} /> <span className="text-xs text-faint">kg</span>
              </p>
              <p className="text-[10px] text-faint">
                range {c.stats.estimated_emissions_avoided.low_kg}–{c.stats.estimated_emissions_avoided.high_kg} kg · {c.stats.estimated_emissions_avoided.records_used} records
              </p>
              <p className="mt-2 text-[10px] leading-relaxed text-faint">Estimate: {c.stats.estimated_emissions_avoided.note}</p>
            </div>
          </div>
        </Card>
      ))}
      <p className="text-[11px] text-faint">Open-burning discussions detected across your communities: {data.open_burning_concerns_detected}. Avoided incidents are counted only when an administrator verifies them; no AQI change is inferred.</p>
    </div>
  );
}

export default function Impact() {
  const [tab, setTab] = useState<"exposure" | "emissions" | "community">("exposure");
  return (
    <div>
      <PageHeader
        eyebrow="Impact intelligence"
        title="What difference do choices make?"
        description="Three separate kinds of impact, each with its method and uncertainty. None of them is presented as a change in your neighbourhood's air quality."
        actions={
          <Tabs
            layoutId="impact-tab"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "exposure", label: <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" />Exposure</span> },
              { value: "emissions", label: <span className="flex items-center gap-1.5"><Bike className="h-3.5 w-3.5" />Emissions</span> },
              { value: "community", label: <span className="flex items-center gap-1.5"><Calculator className="h-3.5 w-3.5" />Community</span> },
            ]}
          />
        }
      />
      <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        {tab === "exposure" && <ExposureTab />}
        {tab === "emissions" && <EmissionsTab />}
        {tab === "community" && <CommunityTab />}
      </motion.div>
    </div>
  );
}
