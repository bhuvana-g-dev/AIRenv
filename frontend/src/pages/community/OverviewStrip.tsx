import { motion } from "motion/react";
import { overviewItems } from "../../lib/community";
import { fmtNum } from "../../lib/format";
import type { CommunityDetail } from "../../lib/types";
import { useCommunityAir } from "./hooks";

export function OverviewStrip({ detail }: { detail: CommunityDetail }) {
  const snap = useCommunityAir(detail.community.location);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {overviewItems(detail, snap.data).map((it, i) => (
        <motion.div
          key={it.label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className="glass rounded-2xl p-4"
        >
          <p className="text-[11px] text-muted">{it.label}</p>
          <p className="mt-1 font-display text-2xl font-semibold" style={{ color: it.color }}>
            {it.value == null ? "—" : fmtNum(it.value)}
          </p>
          <p className="mt-0.5 text-[10px] text-faint">{it.sub}</p>
        </motion.div>
      ))}
    </div>
  );
}
