import { AnimatedNumber, Card } from "../../components/ui";
import { fmtNum, localDayHour } from "../../lib/format";
import { exposureAnnouncement, hasReduction } from "../../lib/impact";
import type { ExposureResult } from "./types";

/** Planned vs cleanest-window inhaled dose and the resulting reduction, plus a live announcement. */
export function ExposureSummary({ result: r }: { result: ExposureResult }) {
  const reduces = hasReduction(r);
  return (
    <>
      <p className="sr-only" aria-live="polite">
        {exposureAnnouncement(r)}
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        <Card hover={false}>
          <p className="text-xs text-muted">Estimated inhaled PM2.5 at planned time</p>
          <p className="mt-2 font-display text-3xl font-semibold">
            <AnimatedNumber value={r.planned?.inhaled_ug ?? null} digits={0} /> <span className="text-sm text-faint">µg</span>
          </p>
          <p className="text-[11px] text-faint">
            mean {fmtNum(r.planned?.mean_pm2_5)} µg/m³ · {r.inhalation_rate_m3_per_h} m³/h
          </p>
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
          <p className="mt-2 font-display text-3xl font-semibold" style={{ color: reduces ? "#35D399" : "#94A89D" }}>
            {reduces ? (
              <>
                <AnimatedNumber value={r.reduction_pct} />%
              </>
            ) : (
              "—"
            )}
          </p>
          <p className="text-[11px] text-faint">
            {reduces ? "by shifting the activity" : "planned time is already among the cleaner hours"}
          </p>
        </Card>
      </div>
    </>
  );
}
