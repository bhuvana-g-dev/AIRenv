import { Activity, ShieldCheck, Wind } from "lucide-react";
import { ConfidenceMeter, TrendIndicator } from "../../components/env";
import { Badge, Card, CardHeader } from "../../components/ui";
import { fmtNum } from "../../lib/format";
import type { Snapshot } from "../../lib/types";

const NEUTRAL = "#94A89D";

const SEVERITY_COLOR: Record<string, string | undefined> = {
  low: "#35D399",
  moderate: "#FACC15",
  elevated: "#FB923C",
  high: "#EF4444",
  severe: "#C0264F",
  unknown: NEUTRAL,
};

const DISPERSION_COLOR: Record<string, string | undefined> = {
  poor: "#FB923C",
  limited: "#FACC15",
  moderate: "#7CE7B4",
  good: "#35D399",
};

/** Deterministic analysis: severity, PM2.5 trend and outlook, dispersion and data confidence. */
export function StatusCard({ analysis: a }: { analysis: Snapshot["analysis"] }) {
  return (
    <Card delay={0.1}>
      <CardHeader
        icon={<Activity aria-hidden="true" className="h-4 w-4" />}
        title="Environmental status"
        subtitle="Deterministic analysis of the latest data"
      />
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">Severity</span>
          <Badge color={SEVERITY_COLOR[a.severity]} dot>
            <span className="capitalize">{a.severity}</span>
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border hairline bg-black/15 p-3">
            <p className="mb-2 text-[11px] text-muted">PM2.5 trend · last {a.trend_pm2_5.window_hours}h</p>
            <TrendIndicator direction={a.trend_pm2_5.direction} change={a.trend_pm2_5.change_pct} />
          </div>
          <div className="rounded-xl border hairline bg-black/15 p-3">
            <p className="mb-2 text-[11px] text-muted">Forecast · next 12h</p>
            <TrendIndicator
              direction={a.outlook_12h.direction}
              change={a.outlook_12h.change_pct}
              label={a.outlook_12h.peak != null ? `peak ${fmtNum(a.outlook_12h.peak)} µg/m³` : undefined}
            />
          </div>
        </div>
        <div className="rounded-xl border hairline bg-black/15 p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] text-muted">
              <Wind aria-hidden="true" className="h-3.5 w-3.5" /> Dispersion
            </span>
            <span className="text-xs font-medium capitalize" style={{ color: DISPERSION_COLOR[a.dispersion.level] ?? NEUTRAL }}>
              {a.dispersion.level}
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">{a.dispersion.explanation}</p>
        </div>
        <div className="rounded-xl border hairline bg-black/15 p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] text-muted">
              <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" /> Data confidence
            </span>
            <ConfidenceMeter level={a.confidence.level} score={a.confidence.score} />
          </div>
          <ul className="mt-1.5 space-y-1 text-xs text-muted">
            {a.confidence.reasons.map((r) => (
              <li key={r}>· {r}</li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}
