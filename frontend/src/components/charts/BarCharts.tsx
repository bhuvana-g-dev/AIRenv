import { useReducedMotion } from "motion/react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { colorForPm25 } from "../../lib/aqi";
import { dailySummary, hourProfileSummary } from "../../lib/chartSummary";
import { AXIS_TICK_STYLE, GRID_STROKE } from "../../lib/chartTheme";

const CURSOR = { fill: "rgba(124,231,180,0.05)" };

interface DailyRow {
  date: string;
  pm2_5_mean: number;
  aqi_mean: number | null;
}

interface HourRow {
  hour: number;
  pm2_5_mean: number;
}

/** The data row under the cursor; recharts passes it as `payload[0].payload`. */
function hoveredRow<Row>({ active, payload }: { active?: boolean; payload?: readonly { payload?: unknown }[] }): Row | null {
  return active && payload?.length ? (payload[0].payload as Row) : null;
}

export function DailyBars({ rows, height = 200 }: { rows: DailyRow[]; height?: number }) {
  const reduce = useReducedMotion();
  return (
    <div style={{ height }} role="img" aria-label={dailySummary(rows)}>
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
          <CartesianGrid stroke={GRID_STROKE} vertical={false} />
          <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={CURSOR}
            content={(props) => {
              const row = hoveredRow<DailyRow>(props);
              return row ? (
                <div className="glass-strong rounded-xl px-3 py-2 text-xs">
                  <div className="text-muted">{row.date}</div>
                  <div className="mt-1">
                    Mean PM2.5 <b>{row.pm2_5_mean}</b> µg/m³
                  </div>
                </div>
              ) : null;
            }}
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

export function HourProfile({ rows, highlight, height = 180 }: { rows: HourRow[]; highlight?: number[]; height?: number }) {
  const reduce = useReducedMotion();
  return (
    <div style={{ height }} role="img" aria-label={hourProfileSummary(rows, highlight)}>
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
          <XAxis
            dataKey="hour"
            tickFormatter={(h: number) => `${h}h`}
            interval={2}
            tick={AXIS_TICK_STYLE}
            axisLine={false}
            tickLine={false}
          />
          <YAxis tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={CURSOR}
            content={(props) => {
              const row = hoveredRow<HourRow>(props);
              return row ? (
                <div className="glass-strong rounded-xl px-3 py-2 text-xs">
                  {row.hour}:00 · avg PM2.5 <b>{row.pm2_5_mean}</b> µg/m³
                </div>
              ) : null;
            }}
          />
          <Bar dataKey="pm2_5_mean" radius={[4, 4, 1, 1]} isAnimationActive={!reduce}>
            {rows.map((r) => {
              const lit = highlight?.includes(r.hour);
              return <Cell key={r.hour} fill={lit ? "#35D399" : colorForPm25(r.pm2_5_mean)} fillOpacity={lit ? 1 : 0.45} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
