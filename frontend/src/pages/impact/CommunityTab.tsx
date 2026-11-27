import { motion } from "motion/react";
import { Leaf, Users } from "lucide-react";
import { AnimatedNumber, Badge, Card, CardHeader, EmptyState, Skeleton } from "../../components/ui";
import { fmtNum } from "../../lib/format";
import { useCommunityImpact } from "./hooks";
import type { CommunityImpact } from "./types";

type ImpactCommunity = CommunityImpact["communities"][number];

function VerifiedActionsTable({ community: c }: { community: ImpactCommunity }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <caption className="sr-only">Verified actions by initiative type for {c.name}</caption>
        <thead className="text-muted">
          <tr className="border-b hairline">
            {["Initiative", "Verified participants", "Verified quantity", "Unverified"].map((h) => (
              <th key={h} scope="col" className="py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {c.stats.by_type.map((r) => (
            <tr key={r.type} className="border-b hairline last:border-0">
              <td className="py-2">{r.label}</td>
              <td className="py-2">
                <div className="flex items-center gap-2">
                  <span className="w-10 tabular-nums">{r.verified_participants}</span>
                  <motion.span
                    aria-hidden="true"
                    className="h-1.5 rounded-full bg-emerald"
                    initial={{ width: 0 }}
                    animate={{ width: Math.min(120, r.verified_participants) }}
                  />
                </div>
              </td>
              <td className="py-2 tabular-nums">
                {fmtNum(r.verified_quantity)} {r.unit}
              </td>
              <td className="py-2 text-faint">{r.unverified_participants}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-faint">Measured: counts of verified actions recorded by administrators.</p>
    </div>
  );
}

function CommunityImpactCard({ community: c }: { community: ImpactCommunity }) {
  const avoided = c.stats.estimated_emissions_avoided;
  return (
    <Card hover={false}>
      <CardHeader
        icon={<Leaf aria-hidden="true" className="h-4 w-4" />}
        title={
          <>
            {c.name} {c.is_demo && <Badge color="#A78BFA">demo</Badge>}
          </>
        }
        subtitle={`${c.stats.totals.verified_records} verified records · ${c.stats.totals.pending_records} pending`}
      />
      <div className="grid gap-4 md:grid-cols-[1fr_300px]">
        <VerifiedActionsTable community={c} />
        <div className="rounded-xl border border-cyan/20 bg-cyan/5 p-4">
          <p className="text-[11px] text-muted">Estimated CO₂e avoided (verified transport records)</p>
          <p className="mt-1 font-display text-2xl font-semibold text-cyan">
            <AnimatedNumber value={avoided.estimate_kg} digits={1} /> <span className="text-xs text-faint">kg</span>
          </p>
          <p className="text-[10px] text-faint">
            range {avoided.low_kg}–{avoided.high_kg} kg · {avoided.records_used} records
          </p>
          <p className="mt-2 text-[10px] leading-relaxed text-faint">Estimate: {avoided.note}</p>
        </div>
      </div>
    </Card>
  );
}

export function CommunityTab() {
  const q = useCommunityImpact();
  if (q.isPending) return <Skeleton className="h-72" label="Loading community impact…" />;
  if (q.isError)
    return (
      <Card hover={false}>
        <EmptyState title="Community impact unavailable" description={q.error.message} />
      </Card>
    );
  const data = q.data;
  if (data.communities.length === 0)
    return (
      <Card hover={false}>
        <EmptyState
          icon={<Users aria-hidden="true" className="h-5 w-5" />}
          title="No communities"
          description="Create or join a community on the Community page to see aggregated, verified actions here."
        />
      </Card>
    );
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/5 px-4 py-2.5 text-xs text-yellow-100">{data.disclaimer}</div>
      {data.communities.map((c) => (
        <CommunityImpactCard key={c.id} community={c} />
      ))}
      <p className="text-[11px] text-faint">
        Open-burning discussions detected across your communities: {data.open_burning_concerns_detected}. Avoided incidents are counted only
        when an administrator verifies them; no AQI change is inferred.
      </p>
    </div>
  );
}
