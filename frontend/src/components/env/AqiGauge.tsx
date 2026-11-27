import { motion, useReducedMotion } from "motion/react";
import { CATEGORY_COLORS, CATEGORY_TEXT_COLORS } from "../../lib/aqi";
import { AQI_MAX, gaugeLabel } from "../../lib/envDisplay";
import type { Snapshot } from "../../lib/types";
import { AnimatedNumber } from "../ui";

const ARC = 0.75; // 270° gauge

export function AqiGauge({
  value,
  category,
  size = 220,
  label = "NAQI",
}: {
  value: number | null;
  category: Snapshot["aqi"]["category"];
  size?: number;
  label?: string;
}) {
  const reduce = useReducedMotion();
  const color = category ? CATEGORY_COLORS[category.key] : "#869B90";
  const r = size / 2 - 14;
  const circ = 2 * Math.PI * r;
  const frac = value == null ? 0 : Math.min(1, value / AQI_MAX);
  return (
    <div className="relative" style={{ width: size, height: size }} role="img" aria-label={gaugeLabel(label, value, category)}>
      <div className="absolute inset-6 rounded-full blur-3xl" style={{ background: `${color}26` }} />
      <svg width={size} height={size} className="relative -rotate-[225deg]">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(124,231,180,0.08)"
          strokeWidth={12}
          strokeDasharray={`${circ * ARC} ${circ}`}
          strokeLinecap="round"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={`${circ * ARC} ${circ}`}
          initial={{ strokeDashoffset: circ * ARC }}
          animate={{ strokeDashoffset: circ * ARC * (1 - frac) }}
          transition={{ duration: reduce ? 0 : 1.4, ease: [0.22, 1, 0.36, 1] }}
          style={{ filter: `drop-shadow(0 0 10px ${color}80)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="label">{label}</span>
        <AnimatedNumber value={value} className="font-display text-6xl font-semibold leading-none tracking-tight" />
        <motion.span
          key={category?.key}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 text-sm font-medium"
          style={{ color: category ? CATEGORY_TEXT_COLORS[category.key] : color }}
        >
          {category?.label ?? "Unavailable"}
        </motion.span>
      </div>
    </div>
  );
}
