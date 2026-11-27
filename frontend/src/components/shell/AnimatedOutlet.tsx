import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useLocation, useOutlet } from "react-router-dom";

/** Route outlet with a short cross-fade between pages (disabled under reduced motion). */
export function AnimatedOutlet() {
  const outlet = useOutlet();
  const loc = useLocation();
  const reduce = useReducedMotion();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={loc.pathname}
        initial={reduce ? false : { opacity: 0, y: 12, filter: "blur(4px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={reduce ? undefined : { opacity: 0, y: -8, filter: "blur(4px)" }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      >
        {outlet}
      </motion.div>
    </AnimatePresence>
  );
}
