import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardHeader, EmptyState } from "../../components/ui";
import { seriesSummary } from "../../lib/chartSummary";
import { AXIS_TICK_STYLE, GRID_STROKE, TOOLTIP_STYLE } from "../../lib/chartTheme";
import { PARTICIPATION_COLORS, monthlyTotals, participationTypes } from "../../lib/community";
import type { CommunityStats } from "../../lib/types";

export function ParticipationChart({ stats }: { stats: CommunityStats }) {
  const rows = stats.monthly_verified_participation;
  const types = participationTypes(rows);
  return (
    <Card hover={false}>
      <CardHeader title="Participation statistics" subtitle="Verified participants per month" />
      {rows.length === 0 ? (
        <EmptyState title="No verified participation yet" />
      ) : (
        <div
          className="h-52"
          role="img"
          aria-label={seriesSummary("Verified participants per month", monthlyTotals(rows, types), "participants")}
        >
          <ResponsiveContainer>
            <BarChart data={rows} margin={{ left: -20, right: 4, top: 8 }}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis dataKey="month" tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {types.map((t, i) => (
                <Bar
                  key={t}
                  dataKey={t}
                  stackId="a"
                  fill={PARTICIPATION_COLORS[i % PARTICIPATION_COLORS.length]}
                  radius={i === types.length - 1 ? [6, 6, 0, 0] : 0}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-faint">{stats.disclaimer}</p>
    </Card>
  );
}
