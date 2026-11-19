import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Bell, CheckCircle2, Info, Sparkles, X } from "lucide-react";
import { useToasts } from "../lib/store";

const TONES = {
  info: { c: "#55D6E8", i: Info },
  success: { c: "#35D399", i: CheckCircle2 },
  warning: { c: "#FACC15", i: Bell },
  danger: { c: "#FB923C", i: AlertTriangle },
  ai: { c: "#A78BFA", i: Sparkles },
};

export function Toasts() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed right-4 top-20 z-[70] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => {
          const tone = TONES[t.tone];
          const Icon = tone.i;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 60, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60, transition: { duration: 0.2 } }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="glass-strong pointer-events-auto flex gap-3 rounded-xl p-3.5 shadow-2xl"
              style={{ borderColor: `${tone.c}40` }}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: tone.c }} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t.title}</p>
                {t.message && <p className="mt-0.5 line-clamp-3 text-xs text-muted">{t.message}</p>}
              </div>
              <button onClick={() => dismiss(t.id)} className="text-faint hover:text-ink" aria-label="Dismiss">
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
