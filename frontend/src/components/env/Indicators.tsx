import { CONFIDENCE_VIEW, signedPct, trendView } from "../../lib/envDisplay";

export function TrendIndicator({ direction, change, label }: { direction: string; change: number | null | undefined; label?: string }) {
  const view = trendView(direction);
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="grid h-8 w-8 place-items-center rounded-lg"
        style={{ background: `${view.color}18`, color: view.color }}
      >
        <view.icon aria-hidden="true" className="h-4 w-4" />
      </span>
      <div>
        <div className="text-sm font-medium" style={{ color: view.color }}>
          {view.label}
          {change != null && <span className="ml-1 text-xs text-muted">({signedPct(change)})</span>}
        </div>
        {label && <div className="text-[11px] text-faint">{label}</div>}
      </div>
    </div>
  );
}

export function ConfidenceMeter({ level, score }: { level: "high" | "medium" | "low"; score?: number }) {
  const { color, bars } = CONFIDENCE_VIEW[level];
  return (
    <span className="inline-flex items-center gap-2 text-xs" title={score != null ? `score ${score}` : undefined}>
      <span className="flex items-end gap-0.5" aria-hidden="true">
        {[1, 2, 3].map((b) => (
          <span
            key={b}
            className="w-1 rounded-sm"
            style={{ height: 4 + b * 3, background: b <= bars ? color : "rgba(124,231,180,0.15)" }}
          />
        ))}
      </span>
      <span style={{ color }} className="capitalize">
        {level} confidence
      </span>
    </span>
  );
}
