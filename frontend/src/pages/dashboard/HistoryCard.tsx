import { BarChart3 } from "lucide-react";
import { DailyBars, HourProfile } from "../../components/charts";
import { Card, CardHeader, ErrorState, Skeleton } from "../../components/ui";
import { fmtNum, pct } from "../../lib/format";
import { useHistory } from "../../lib/queries";
import type { HistoryResponse } from "../../lib/types";

function comparisonTiles(c: HistoryResponse["comparisons"]) {
  return [
    { label: "vs yesterday, same hour", change: c.vs_yesterday_same_hour.change_pct, then: c.vs_yesterday_same_hour.value },
    { label: "vs 7 days ago, same hour", change: c.vs_week_ago_same_hour.change_pct, then: c.vs_week_ago_same_hour.value },
    { label: "vs 7-day mean", change: c.vs_seven_day_mean_pct, then: c.seven_day_mean },
  ];
}

export function HistoryCard() {
  const history = useHistory();
  if (history.isLoading) return <Skeleton className="h-[360px] lg:col-span-2" label="Loading history…" />;
  if (history.isError || !history.data)
    return (
      <Card>
        <ErrorState title="History unavailable" message={history.error?.message} />
      </Card>
    );
  const c = history.data.comparisons;
  const cleanest = c.typically_cleanest_daytime_hours.map((h) => h.hour);
  return (
    <Card delay={0.2} className="lg:col-span-2">
      <CardHeader icon={<BarChart3 aria-hidden="true" className="h-4 w-4" />} title="Historical comparison" subtitle={c.basis} />
      <div className="mb-4 grid grid-cols-3 gap-3">
        {comparisonTiles(c).map((x) => (
          <div key={x.label} className="rounded-xl border hairline bg-black/15 p-3">
            <p className="text-[11px] text-muted">{x.label}</p>
            <p
              className="mt-1 font-display text-xl font-semibold"
              style={{ color: x.change == null ? undefined : x.change > 0 ? "#FB923C" : "#35D399" }}
            >
              {pct(x.change)}
            </p>
            <p className="text-[10px] text-faint">PM2.5 then: {fmtNum(x.then)} µg/m³</p>
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
      <p className="mt-2 text-[11px] text-faint">
        AIRenv has also recorded {history.data.recorded.length} hourly snapshots for this location through scheduled refreshes.
      </p>
    </Card>
  );
}
