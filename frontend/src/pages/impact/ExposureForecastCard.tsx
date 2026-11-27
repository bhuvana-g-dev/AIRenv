import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardHeader } from "../../components/ui";
import { seriesSummary } from "../../lib/chartSummary";
import { AXIS_TICK_STYLE, GRID_STROKE, TOOLTIP_STYLE } from "../../lib/chartTheme";
import { fmtNum, localDayHour } from "../../lib/format";
import { exposureBars, exposureForecastLabel, windowEnd } from "../../lib/impact";
import type { ExposureResult } from "./types";

function ForecastWindowsChart({ result: r, hours }: { result: ExposureResult; hours: number }) {
  return (
    <div className="h-64" role="img" aria-label={exposureForecastLabel(r)}>
      <ResponsiveContainer>
        <AreaChart data={r.forecast} margin={{ left: -16, right: 6, top: 6 }}>
          <defs>
            <linearGradient id="exp-g" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#55D6E8" stopOpacity={0.4} />
              <stop offset="1" stopColor="#55D6E8" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID_STROKE} vertical={false} />
          <XAxis
            dataKey="time"
            tickFormatter={(t: string) => t.slice(11, 16)}
            interval={5}
            tick={AXIS_TICK_STYLE}
            axisLine={false}
            tickLine={false}
          />
          <YAxis tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} />
          <Tooltip
            labelFormatter={(t) => localDayHour(String(t))}
            contentStyle={TOOLTIP_STYLE}
            formatter={(v) => [`${String(v)} µg/m³`, "PM2.5"]}
          />
          {r.planned && (
            <ReferenceArea x1={r.planned.start} x2={windowEnd(r.forecast, r.planned.start, hours)} fill="#FB923C" fillOpacity={0.15} />
          )}
          {r.best && <ReferenceArea x1={r.best.start} x2={windowEnd(r.forecast, r.best.start, hours)} fill="#35D399" fillOpacity={0.18} />}
          <Area type="monotone" dataKey="pm2_5" stroke="#55D6E8" strokeWidth={2} fill="url(#exp-g)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function DoseBars({ result }: { result: ExposureResult }) {
  const bars = exposureBars(result);
  return (
    <div
      className="h-28"
      role="img"
      aria-label={seriesSummary(
        "Estimated inhaled PM2.5",
        bars.map((b) => ({ label: b.name, value: b.v })),
        "µg",
      )}
    >
      <ResponsiveContainer>
        <BarChart data={bars} layout="vertical" margin={{ left: 10, right: 20 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" tick={{ fill: "#94A89D", fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
          <Tooltip formatter={(v) => [`${String(v)} µg`, "Inhaled PM2.5"]} contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="v" radius={[0, 8, 8, 0]}>
            {bars.map((b) => (
              <Cell key={b.name} fill={b.c} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ExposureForecastCard({ result: r, hours }: { result: ExposureResult; hours: number }) {
  return (
    <Card hover={false}>
      <CardHeader title="Forecast PM2.5 & activity windows" subtitle="Orange: planned window · green: cleanest window · model forecast" />
      <ForecastWindowsChart result={r} hours={hours} />
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <DoseBars result={r} />
        <div>
          <p className="mb-1.5 text-xs text-muted">Cleanest daytime windows (next 48 h)</p>
          <ul className="space-y-1">
            {r.alternatives.map((a) => (
              <li key={a.start} className="flex justify-between rounded-lg bg-black/15 px-2.5 py-1.5 text-xs">
                <span>{localDayHour(a.start)}</span>
                <span className="text-muted">
                  {fmtNum(a.mean_pm2_5)} µg/m³ · {fmtNum(a.inhaled_ug)} µg
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-faint">
        {r.uncertainty} Sources: {r.sources.join("; ")}.
      </p>
    </Card>
  );
}
