import { motion } from "motion/react";
import { AlertTriangle, CloudFog, Database, ExternalLink, FlaskConical } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { FRESHNESS_VIEW } from "../../lib/envDisplay";
import { absoluteTime, timeAgo } from "../../lib/format";
import type { Snapshot } from "../../lib/types";
import { Badge, Button } from "../ui";

export function FreshnessPill({ snapshot }: { snapshot: Snapshot }) {
  const view = FRESHNESS_VIEW[snapshot.freshness.status];
  return (
    <Badge color={view.color} dot>
      {view.label}
      {snapshot.freshness.age_minutes != null && <span className="text-faint">· {snapshot.freshness.age_minutes} min</span>}
    </Badge>
  );
}

export function Provenance({ snapshot, compact }: { snapshot: Snapshot; compact?: boolean }) {
  const src = snapshot.sources.air;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted", compact && "gap-x-3")}>
      <span className="inline-flex items-center gap-1.5">
        <Database aria-hidden="true" className="h-3.5 w-3.5 text-cyan" />
        {src.url ? (
          <a href={src.url} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-ink">
            {src.name}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : (
          src.name
        )}
      </span>
      <span>
        Observed {snapshot.observed_local?.replace("T", " ") ?? "—"} ({snapshot.utc_offset})
      </span>
      {!compact && <span>Fetched {timeAgo(snapshot.fetched_at)}</span>}
      <span>
        {snapshot.location.name} · {snapshot.location.lat.toFixed(3)}, {snapshot.location.lon.toFixed(3)}
      </span>
      {src.type === "model" && !compact && <Badge color="#55D6E8">model estimate · not a monitor reading</Badge>}
    </div>
  );
}

export function DemoBanner() {
  return (
    <motion.div
      role="note"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4 flex items-center gap-3 rounded-xl border border-violet/30 bg-violet/10 px-4 py-2.5 text-sm text-violet-100"
    >
      <FlaskConical aria-hidden="true" className="h-4 w-4 shrink-0 text-violet" />
      <span>
        <strong className="font-semibold">Sample data.</strong> Live providers are unreachable, so you are viewing an illustrative dataset.
        Do not use it for decisions.
      </span>
    </motion.div>
  );
}

export function StaleBanner({ snapshot }: { snapshot: Snapshot }) {
  if (snapshot.status !== "stale") return null;
  return (
    <div
      role="note"
      className="mb-4 flex items-center gap-3 rounded-xl border border-orange-400/30 bg-orange-400/10 px-4 py-2.5 text-sm text-orange-100"
    >
      <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0 text-orange-300" />
      <span>
        Showing the last stored reading from {absoluteTime(snapshot.observed_at)}.{" "}
        {snapshot.errors.map((e) => e.provider).join(", ") || "Live providers"} did not respond.
      </span>
    </div>
  );
}

export function DataUnavailable({
  message,
  onDemo,
  onRetry,
  headingLevel = "h1",
}: {
  message: string;
  onDemo?: () => void;
  onRetry?: () => void;
  headingLevel?: "h1" | "h2";
}) {
  const Heading = headingLevel;
  return (
    <div role="alert" className="glass mx-auto my-10 max-w-xl rounded-2xl p-8 text-center">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-orange-400/25 bg-orange-400/10 text-orange-300">
        <CloudFog aria-hidden="true" className="h-6 w-6" />
      </div>
      <Heading className="font-display text-lg font-semibold">Live environmental data is unavailable</Heading>
      <p className="mt-2 text-sm text-muted">{message}</p>
      <p className="mt-2 text-xs text-faint">
        AIRenv never fills gaps with invented readings. You can retry, or explore the interface with clearly labelled sample data.
      </p>
      <div className="mt-5 flex justify-center gap-2">
        {onRetry && (
          <Button variant="outline" onClick={onRetry}>
            Retry
          </Button>
        )}
        {onDemo && (
          <Button variant="ai" onClick={onDemo} icon={<FlaskConical aria-hidden="true" className="h-4 w-4" />}>
            View sample data
          </Button>
        )}
      </div>
    </div>
  );
}

export function ExternalSource({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan hover:underline">
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
      <ExternalLink aria-hidden="true" className="h-3 w-3" />
    </a>
  );
}
