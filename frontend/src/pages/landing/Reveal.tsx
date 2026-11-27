import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/** Fades content up the first time it scrolls into view. */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function SectionTitle({ eyebrow, title, text }: { eyebrow: string; title: ReactNode; text?: ReactNode }) {
  return (
    <Reveal className="mx-auto mb-12 max-w-3xl text-center">
      <p className="label mb-3 text-mint">{eyebrow}</p>
      <h2 className="font-display text-3xl font-semibold tracking-tight md:text-[42px] md:leading-[1.1]">{title}</h2>
      {text && <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-muted">{text}</p>}
    </Reveal>
  );
}
