import { useReducedMotion } from "motion/react";
import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CATEGORY_COLORS, NAQI_BANDS, colorForAqi, colorForPm25 } from "../../lib/aqi";
import { trendSummary } from "../../lib/chartSummary";
import { AXIS_TICK_STYLE, GRID_STROKE } from "../../lib/chartTheme";
import { localDayHour } from "../../lib/format";
import { METRIC_LABEL, type Metric } from "../../lib/metrics";
import { trendPoints, trendTick, trendYMax, type TrendPoint } from "../../lib/trendData";
import type { Series } from "../../lib/types";

function ChartTooltip({ active, payload, metric }: { active?: boolean; payload?: { payload: TrendPoint }[]; metric: Metric }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const color = metric === "aqi_in" ? colorForAqi(p.value) : colorForPm25(p.value);
  return (
    <div className="glass-strong rounded-xl px-3 py-2 text-xs shadow-xl">
      <div className="text-muted">
        {localDayHour(p.t)} · {p.isForecast ? "forecast" : "model history"}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        <span className="font-display text-base font-semibold">{p.value ?? "—"}</span>
        <span className="text-faint">{METRIC_LABEL[metric].unit}</span>
      </div>
    </div>
  );
}

/**
 * Dashed NAQI "satisfactory" limit and WHO guideline lines for the PM2.5 chart. A fragment
 * element rather than a component: recharts only recognises its own element types (and
 * fragments) as direct chart children.
 */
const PM25_GUIDES = (
  <>
    <ReferenceLine
      y={60}
      stroke="#A3E635"
      strokeDasharray="3 4"
      strokeOpacity={0.5}
      label={{ value: "NAQI 24h ‘satisfactory’ limit 60", fill: "#A3E635", fontSize: 9, position: "insideTopRight" }}
    />
    <ReferenceLine
      y={15}
      stroke="#55D6E8"
      strokeDasharray="3 4"
      strokeOpacity={0.5}
      label={{ value: "WHO 24h guideline 15", fill: "#55D6E8", fontSize: 9, position: "insideBottomRight" }}
    />
  </>
);

export function TrendChart({
  series,
  metric,
  pastHours = 48,
  futureHours = 72,
  height = 280,
}: {
  series: Series;
  metric: Metric;
  pastHours?: number;
  futureHours?: number;
  height?: number;
}) {
  const reduce = useReducedMotion();
  const data = useMemo(() => trendPoints(series, metric, pastHours, futureHours), [series, metric, pastHours, futureHours]);
  const nowT = series.times[series.now_index];
  const nowValue = data.find((d) => d.t === nowT)?.value;
  const yMax = trendYMax(metric, data);
  const stroke = metric === "aqi_in" ? colorForAqi(nowValue ?? null) : "#55D6E8";
  const gid = `g-${metric}`;
  const { label, unit } = METRIC_LABEL[metric];
  const summary = useMemo(
    () => trendSummary({ label, unit, points: data, nowValue, isAqi: metric === "aqi_in" }),
    [data, label, unit, nowValue, metric],
  );
  const areaProps = {
    type: "monotone",
    strokeWidth: 2,
    connectNulls: false,
    isAnimationActive: !reduce,
    animationDuration: 900,
    dot: false,
    activeDot: { r: 4 },
  } as const;

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
              <ReferenceArea
                key={b.key}
                y1={b.min}
                y2={Math.min(b.max, yMax)}
                fill={CATEGORY_COLORS[b.key]}
                fillOpacity={0.045}
                stroke="none"
                ifOverflow="hidden"
              />
            ))}
          <CartesianGrid stroke={GRID_STROKE} vertical={false} />
          <XAxis
            dataKey="t"
            tickFormatter={(t: string) => trendTick(t, localDayHour)}
            interval={Math.max(1, Math.floor(data.length / 8))}
            tick={AXIS_TICK_STYLE}
            axisLine={false}
            tickLine={false}
          />
          <YAxis domain={[0, yMax]} tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} width={44} />
          {metric === "pm2_5" && PM25_GUIDES}
          <ReferenceLine
            x={nowT}
            stroke="#F2F7F4"
            strokeOpacity={0.35}
            strokeDasharray="2 3"
            label={{ value: "now", fill: "#F2F7F4", fontSize: 10, position: "top" }}
          />
          <Tooltip content={<ChartTooltip metric={metric} />} cursor={{ stroke: "rgba(124,231,180,0.25)" }} />
          <Area {...areaProps} dataKey="observed" stroke={stroke} fill={`url(#${gid})`} />
          <Area {...areaProps} dataKey="forecast" stroke="#A78BFA" strokeDasharray="5 4" fill={`url(#${gid}-f)`} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
