import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, type ReactNode } from "react";
import { cn } from "../../lib/cn";

/**
 * Placeholder block. Decorative by default; pass `label` when it is the only loading
 * indicator for a region so screen readers hear e.g. "Loading history".
 */
export function Skeleton({ className, label }: { className?: string; label?: string }) {
  if (label)
    return (
      <div role="status" aria-busy="true" className={cn("skeleton rounded-xl", className)}>
        <span className="sr-only">{label}</span>
      </div>
    );
  return <div className={cn("skeleton rounded-xl", className)} aria-hidden="true" />;
}

/** Wraps a group of skeletons in a single polite status announcement. */
export function LoadingRegion({ label = "Loading…", className, children }: { label?: string; className?: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Number that counts up to its value (jumps straight there under reduced motion). */
export function AnimatedNumber({
  value,
  digits = 0,
  className,
}: {
  value: number | null | undefined;
  digits?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) =>
    value == null ? "—" : v.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits }),
  );
  useEffect(() => {
    if (value == null) return;
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration: 1.1, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [value, reduce, mv]);
  return <motion.span className={cn("tabular-nums", className)}>{text}</motion.span>;
}
