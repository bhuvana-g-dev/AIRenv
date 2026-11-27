import { motion } from "motion/react";
import { Brain, Sparkles } from "lucide-react";
import { RecommendationCard } from "../../components/env";
import { Badge, Card, CardHeader, EmptyState, ErrorState, LoadingRegion, Skeleton } from "../../components/ui";
import { useBriefing } from "../../lib/queries";
import type { Briefing } from "../../lib/types";

function engineLabel(b: Briefing): string {
  if (b.generated_by === "gemini") return "Gemini";
  return b.ai_available ? "Rules (AI fallback)" : "Rule engine";
}

function BriefingBody({ briefing: b }: { briefing: Briefing }) {
  return (
    <div className="relative">
      <motion.h3
        key={b.headline}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="font-display text-xl font-semibold tracking-tight"
      >
        {b.headline}
      </motion.h3>
      <p className="mt-2 text-sm leading-relaxed text-ink/85">{b.summary}</p>
      {b.key_points.length > 0 && (
        <ul className="mt-3 grid gap-1.5 md:grid-cols-2">
          {b.key_points.map((k) => (
            <li key={k} className="flex gap-2 text-xs leading-relaxed text-muted">
              <Sparkles aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0 text-cyan" />
              {k}
            </li>
          ))}
        </ul>
      )}
      {b.ai_note && <p className="mt-2 text-[11px] text-faint">{b.ai_note}</p>}
      <div className="mt-5 space-y-2.5">
        {b.recommendations.length === 0 ? (
          <EmptyState
            title="No actions needed right now"
            description="Conditions don't call for changes. AIRenv keeps monitoring and will alert you if that changes."
          />
        ) : (
          b.recommendations.slice(0, 5).map((r, i) => <RecommendationCard key={r.id} rec={r} index={i} defaultOpen={i === 0} />)
        )}
      </div>
    </div>
  );
}

export function BriefingCard() {
  const briefing = useBriefing();
  return (
    <Card delay={0.15} className="lg:col-span-2">
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan/[0.06] via-transparent to-violet/[0.06]" />
      <CardHeader
        icon={<Brain aria-hidden="true" className="h-4 w-4 text-cyan" />}
        title={<span className="text-gradient-ai">AI intelligence briefing</span>}
        subtitle="Rules decide and calculate; AI explains. Every figure comes from the data shown."
        action={
          briefing.data && (
            <Badge color={briefing.data.generated_by === "gemini" ? "#A78BFA" : "#94A89D"}>{engineLabel(briefing.data)}</Badge>
          )
        }
      />
      {briefing.isLoading && (
        <LoadingRegion label="Generating briefing…" className="space-y-3">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-16" />
          <Skeleton className="h-20" />
        </LoadingRegion>
      )}
      {briefing.isError && <ErrorState title="Briefing unavailable" message={briefing.error.message} />}
      {briefing.data && <BriefingBody briefing={briefing.data} />}
    </Card>
  );
}
