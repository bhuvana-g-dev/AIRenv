import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useReducedMotion } from "motion/react";
import { CATEGORY_COLORS, NAQI_BANDS, colorForAqi, colorForPm25 } from "../lib/aqi";
import { dailySummary, hourProfileSummary, trendSummary } from "../lib/chartSummary";
import { localDayHour } from "../lib/format";
import { METRIC_LABEL, type Metric } from "../lib/metrics";
import type { Series } from "../lib/types";

/** Axis tick colour: the `--color-faint` token, ≥4.5:1 on the dark card surfaces. */
export const AXIS_TICK = "#869B90";


interface Point {
  t: string;
  observed: number | null;
  forecast: number | null;
  value: number | null;
  isForecast: boolean;
}

function ChartTooltip({ active, payload, metric }: { active?: boolean; payload?: { payload: Point }[]; metric: Metric }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const color = metric === "aqi_in" ? colorForAqi(p.value) : colorForPm25(p.value);
  return (
    <div className="glass-strong rounded-xl px-3 py-2 text-xs shadow-xl">
      <div className="text-muted">{localDayHour(p.t)} · {p.isForecast ? "forecast" : "model history"}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        <span className="font-display text-base font-semibold">{p.value ?? "—"}</span>
        <span className="text-faint">{METRIC_LABEL[metric].unit}</span>
      </div>
    </div>
  );
}

export function TrendChart({ series, metric, pastHours = 48, futureHours = 72, height = 280 }: { series: Series; metric: Metric; pastHours?: number; futureHours?: number; height?: number }) {
  const reduce = useReducedMotion();
  const data = useMemo<Point[]>(() => {
    const ni = series.now_index;
    const start = Math.max(0, ni - pastHours);
    const end = Math.min(series.times.length, ni + futureHours + 1);
    const vals = series.hourly[metric];
    const out: Point[] = [];
    for (let i = start; i < end; i++) {
      const v = vals[i] ?? null;
      out.push({ t: series.times[i], observed: i <= ni ? v : null, forecast: i >= ni ? v : null, value: v, isForecast: i > ni });
    }
    return out;
  }, [series, metric, pastHours, futureHours]);

  const nowT = series.times[series.now_index];
  const max = Math.max(...data.map((d) => d.value ?? 0));
  const yMax = metric === "aqi_in" ? Math.min(500, Math.ceil((max + 30) / 50) * 50) : Math.ceil((max * 1.15) / 10) * 10;
  const stroke = metric === "aqi_in" ? colorForAqi(data.find((d) => d.t === nowT)?.value ?? null) : "#55D6E8";
  const gid = `g-${metric}`;
  const summary = useMemo(
    () => trendSummary({ label: METRIC_LABEL[metric].label, unit: METRIC_LABEL[metric].unit, points: data, nowValue: data.find((d) => d.t === nowT)?.value, isAqi: metric === "aqi_in" }),
    [data, metric, nowT],
  );

  return (
    <div style={{ height }} className="w-full" role="img" aria-label={summary}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 10, right: 8, left: -14, bottom: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.45} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
            <linearGradient id={`${gid}-f`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#A78BFA" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#A78BFA" stopOpacity={0} />
            </linearGradient>
          </defs>
          {metric === "aqi_in" &&
            NAQI_BANDS.filter((b) => b.min < yMax).map((b) => (
              <ReferenceArea key={b.key} y1={b.min} y2={Math.min(b.max, yMax)} fill={CATEGORY_COLORS[b.key]} fillOpacity={0.045} stroke="none" ifOverflow="hidden" />
            ))}
          <CartesianGrid stroke="rgba(124,231,180,0.06)" vertical={false} />
          <XAxis
            dataKey="t"
            tickFormatter={(t: string) => (t.slice(11, 13) === "00" ? localDayHour(t).slice(0, 3) : t.slice(11, 16))}
            interval={Math.max(1, Math.floor(data.length / 8))}
            tick={{ fill: AXIS_TICK, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis domain={[0, yMax]} tick={{ fill: AXIS_TICK, fontSize: 10 }} axisLine={false} tickLine={false} width={44} />
          {metric === "pm2_5" && (
            <>
              <ReferenceLine y={60} stroke="#A3E635" strokeDasharray="3 4" strokeOpacity={0.5} label={{ value: "NAQI 24h ‘satisfactory’ limit 60", fill: "#A3E635", fontSize: 9, position: "insideTopRight" }} />
              <ReferenceLine y={15} stroke="#55D6E8" strokeDasharray="3 4" strokeOpacity={0.5} label={{ value: "WHO 24h guideline 15", fill: "#55D6E8", fontSize: 9, position: "insideBottomRight" }} />
            </>
          )}
          <ReferenceLine x={nowT} stroke="#F2F7F4" strokeOpacity={0.35} strokeDasharray="2 3" label={{ value: "now", fill: "#F2F7F4", fontSize: 10, position: "top" }} />
          <Tooltip content={<ChartTooltip metric={metric} />} cursor={{ stroke: "rgba(124,231,180,0.25)" }} />
          <Area type="monotone" dataKey="observed" stroke={stroke} strokeWidth={2} fill={`url(#${gid})`} connectNulls={false} isAnimationActive={!reduce} animationDuration={900} dot={false} activeDot={{ r: 4 }} />
          <Area type="monotone" dataKey="forecast" stroke="#A78BFA" strokeWidth={2} strokeDasharray="5 4" fill={`url(#${gid}-f)`} connectNulls={false} isAnimationActive={!reduce} animationDuration={900} dot={false} activeDot={{ r: 4 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DailyBars({ rows, height = 200 }: { rows: { date: string; pm2_5_mean: number; aqi_mean: number | null }[]; height?: number }) {
  const reduce = useReducedMotion();
  return (
    <div style={{ height }} role="img" aria-label={dailySummary(rows)}>
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
          <CartesianGrid stroke="rgba(124,231,180,0.06)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} tick={{ fill: AXIS_TICK, fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: AXIS_TICK, fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: "rgba(124,231,180,0.05)" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="glass-strong rounded-xl px-3 py-2 text-xs">
                  <div className="text-muted">{(payload[0].payload as { date: string }).date}</div>
                  <div className="mt-1">
                    Mean PM2.5 <b>{(payload[0].payload as { pm2_5_mean: number }).pm2_5_mean}</b> µg/m³
                  </div>
                </div>
              ) : null
            }
          />
          <Bar dataKey="pm2_5_mean" radius={[6, 6, 2, 2]} isAnimationActive={!reduce} animationDuration={800}>
            {rows.map((r) => (
              <Cell key={r.date} fill={colorForPm25(r.pm2_5_mean)} fillOpacity={0.8} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HourProfile({ rows, highlight, height = 180 }: { rows: { hour: number; pm2_5_mean: number }[]; highlight?: number[]; height?: number }) {
  const reduce = useReducedMotion();
  return (
    <div style={{ height }} role="img" aria-label={hourProfileSummary(rows, highlight)}>
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
          <XAxis dataKey="hour" tickFormatter={(h: number) => `${h}h`} interval={2} tick={{ fill: AXIS_TICK, fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: AXIS_TICK, fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: "rgba(124,231,180,0.05)" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="glass-strong rounded-xl px-3 py-2 text-xs">
                  {(payload[0].payload as { hour: number }).hour}:00 · avg PM2.5 <b>{(payload[0].payload as { pm2_5_mean: number }).pm2_5_mean}</b> µg/m³
                </div>
              ) : null
            }
          />
          <Bar dataKey="pm2_5_mean" radius={[4, 4, 1, 1]} isAnimationActive={!reduce}>
            {rows.map((r) => (
              <Cell key={r.hour} fill={highlight?.includes(r.hour) ? "#35D399" : colorForPm25(r.pm2_5_mean)} fillOpacity={highlight?.includes(r.hour) ? 1 : 0.45} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
