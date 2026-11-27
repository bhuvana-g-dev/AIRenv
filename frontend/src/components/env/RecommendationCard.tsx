import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Sparkles } from "lucide-react";
import { useId, useState } from "react";
import { benefitColor } from "../../lib/envDisplay";
import type { Recommendation } from "../../lib/types";
import { Badge } from "../ui";
import { ConfidenceMeter } from "./Indicators";

const REC_FIELDS: { key: "what_is_happening" | "why_it_matters" | "action" | "alternative" | "expected_benefit"; label: string }[] = [
  { key: "what_is_happening", label: "What is happening" },
  { key: "why_it_matters", label: "Why it matters" },
  { key: "action", label: "Recommended action" },
  { key: "alternative", label: "Alternative" },
  { key: "expected_benefit", label: "Expected benefit" },
];
const BENEFIT_LABEL = { exposure: "Exposure", emissions: "Emissions", qualitative: "Qualitative" };

function RecommendationDetails({ rec }: { rec: Recommendation }) {
  return (
    <div className="space-y-3 border-t hairline px-4 pb-4 pt-3">
      {REC_FIELDS.map((f) => (
        <div key={f.key}>
          <div className="label !text-[10px]">{f.label}</div>
          <p className="mt-0.5 text-[13px] leading-relaxed text-ink/90">{rec[f.key]}</p>
        </div>
      ))}
      <div>
        <div className="label !text-[10px]">Confidence</div>
        <p className="mt-0.5 text-[13px] leading-relaxed text-ink/90">{rec.confidence.reason}</p>
      </div>
      {rec.data_refs.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {rec.data_refs.map((d, i) => (
            <span
              key={i}
              className="rounded-md border hairline bg-white/[0.02] px-2 py-1 font-mono text-[10px] text-muted"
              title={`${d.source ?? ""} · ${d.observed_at ?? ""}`}
            >
              {d.label}: <span className="text-ink">{d.value ?? "—"}</span> {d.unit}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function RecommendationCard({
  rec,
  defaultOpen = false,
  index = 0,
}: {
  rec: Recommendation;
  defaultOpen?: boolean;
  index?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const detailsId = `rec-details-${useId().replace(/:/g, "")}`;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.4 }}
      className="overflow-hidden rounded-xl border hairline bg-black/20"
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-start gap-3 p-4 text-left"
        aria-expanded={open}
        aria-controls={detailsId}
      >
        <span
          aria-hidden="true"
          className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-cyan/20 to-violet/20 text-cyan"
        >
          <Sparkles aria-hidden="true" className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{rec.title}</span>
          <span className="mt-1 block text-xs leading-relaxed text-muted">{rec.action}</span>
          <span className="mt-2 flex flex-wrap items-center gap-2">
            <ConfidenceMeter level={rec.confidence.level} />
            <Badge color={benefitColor(rec.benefit_type)}>{BENEFIT_LABEL[rec.benefit_type]} benefit</Badge>
          </span>
        </span>
        <motion.span aria-hidden="true" animate={{ rotate: open ? 180 : 0 }} className="mt-1 text-muted">
          <ChevronDown aria-hidden="true" className="h-4 w-4" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={detailsId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <RecommendationDetails rec={rec} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
