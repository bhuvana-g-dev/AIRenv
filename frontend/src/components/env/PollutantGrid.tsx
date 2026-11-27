import { motion } from "motion/react";
import { colorForAqi } from "../../lib/aqi";
import { cn } from "../../lib/cn";
import { subIndexWidthPct } from "../../lib/envDisplay";
import { fmtNum } from "../../lib/format";
import type { PollutantKey, Snapshot } from "../../lib/types";
import { AnimatedNumber, Badge } from "../ui";

const POLLUTANT_ORDER: PollutantKey[] = ["pm2_5", "pm10", "no2", "o3", "co", "so2"];

export function PollutantGrid({ snapshot }: { snapshot: Snapshot }) {
  const dominant = snapshot.aqi.dominant_pollutant;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {POLLUTANT_ORDER.map((k, i) => {
        const p = snapshot.pollutants[k];
        const sub = p.sub_index;
        const digits = k === "co" ? 2 : 0;
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
              <AnimatedNumber value={p.value} digits={digits} className="font-display text-xl font-semibold" />
              <span className="text-[10px] text-faint">{p.unit}</span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/5" aria-hidden="true">
              <motion.div
                className="h-full rounded-full"
                style={{ background: colorForAqi(sub) }}
                initial={{ width: 0 }}
                animate={{ width: `${subIndexWidthPct(sub)}%` }}
                transition={{ duration: 1, delay: 0.1 + 0.05 * i }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-faint">
              <span>sub-index {sub ?? "—"}</span>
              {p.average && p.average.period_hours > 1 && (
                <span>
                  {p.average.period_hours}h avg {fmtNum(p.average.value, digits)}
                </span>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
