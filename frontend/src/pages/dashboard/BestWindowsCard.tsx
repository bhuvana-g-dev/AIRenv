import { motion } from "motion/react";
import { Clock } from "lucide-react";
import { Card, CardHeader, EmptyState } from "../../components/ui";
import { cleanerWindows, windowLabel } from "../../lib/bestWindows";
import { fmtNum } from "../../lib/format";
import type { Series } from "../../lib/types";

export function BestWindowsCard({ series }: { series: Series }) {
  const { chosen, worst } = cleanerWindows(series);
  return (
    <Card delay={0.25}>
      <CardHeader
        icon={<Clock aria-hidden="true" className="h-4 w-4" />}
        title="Cleaner windows ahead"
        subtitle="Lowest forecast PM2.5 for a 2-hour daytime activity, next 36 h"
      />
      {chosen.length === 0 ? (
        <EmptyState title="No daytime forecast hours available" />
      ) : (
        <ol className="space-y-2">
          {chosen.map((c, idx) => (
            <motion.li
              key={c.i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.08 }}
              className="flex items-center justify-between rounded-xl border hairline bg-black/15 px-3 py-2.5"
            >
              <span className="flex items-center gap-3">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald/15 font-mono text-xs text-mint">{idx + 1}</span>
                <span className="text-sm">{windowLabel(series.times, c.i)}</span>
              </span>
              <span className="text-xs text-muted">~{fmtNum(c.mean)} µg/m³</span>
            </motion.li>
          ))}
        </ol>
      )}
      {worst && (
        <p className="mt-3 text-[11px] text-faint">
          Highest daytime 2-hour window in this period: ~{fmtNum(worst.mean)} µg/m³ at {series.times[worst.i].slice(11, 16)}. Forecasts are
          estimates.
        </p>
      )}
    </Card>
  );
}
