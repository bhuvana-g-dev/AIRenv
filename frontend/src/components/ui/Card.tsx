import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export function Card({
  children,
  className,
  hover = true,
  delay = 0,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  delay?: number;
  as?: "div" | "section" | "article";
}) {
  const reduce = useReducedMotion();
  const Comp = motion[as];
  return (
    <Comp
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={hover && !reduce ? { y: -3, transition: { duration: 0.25 } } : undefined}
      className={cn(
        "glass relative rounded-2xl p-5 transition-shadow duration-300",
        hover && "hover:shadow-[0_24px_60px_-30px_rgba(53,211,153,0.35)]",
        className,
      )}
    >
      {children}
    </Comp>
  );
}

export function CardHeader({
  icon,
  title,
  subtitle,
  action,
  as: Heading = "h2",
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  /** Heading level. Cards sit directly under the page h1, so h2 by default. */
  as?: "h2" | "h3";
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-[min(100%,220px)] flex-1 items-start gap-3">
        {icon && (
          <div
            className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border hairline bg-emerald/5 text-mint"
            aria-hidden="true"
          >
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <Heading className="font-display text-[15px] font-semibold tracking-tight text-ink">{title}</Heading>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
