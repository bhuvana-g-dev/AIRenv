import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Bell, CheckCircle2, Info, Sparkles, X } from "lucide-react";
import { useToasts, type Toast } from "../lib/store";

const TONES = {
  info: { c: "#55D6E8", i: Info, sr: "Information" },
  success: { c: "#35D399", i: CheckCircle2, sr: "Success" },
  warning: { c: "#FACC15", i: Bell, sr: "Warning" },
  danger: { c: "#FB923C", i: AlertTriangle, sr: "Error" },
  ai: { c: "#A78BFA", i: Sparkles, sr: "AIRenv AI" },
};

function ToastItem({ t }: { t: Toast }) {
  const dismiss = useToasts((s) => s.dismiss);
  const hold = useToasts((s) => s.hold);
  const release = useToasts((s) => s.release);
  const tone = TONES[t.tone];
  const Icon = tone.i;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 60, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, transition: { duration: 0.2 } }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      onMouseEnter={() => hold(t.id)}
      onMouseLeave={() => release(t.id)}
      onFocus={() => hold(t.id)}
      onBlur={() => release(t.id)}
      className="glass-strong pointer-events-auto flex gap-3 rounded-xl p-3.5 shadow-2xl"
      style={{ borderColor: `${tone.c}40` }}
    >
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" style={{ color: tone.c }} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          <span className="sr-only">{tone.sr}: </span>
          {t.title}
        </p>
        {t.message && <p className="mt-0.5 line-clamp-3 text-xs text-muted">{t.message}</p>}
      </div>
      <button type="button" onClick={() => dismiss(t.id)} className="-m-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-faint hover:bg-white/5 hover:text-ink" aria-label={`Dismiss notification: ${t.title}`}>
        <X aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  );
}

/**
 * Toast stack. Two persistent live regions: errors are announced assertively
 * (`role="alert"`), everything else politely (`role="status"`).
 */
export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  const urgent = toasts.filter((t) => t.tone === "danger");
  const polite = toasts.filter((t) => t.tone !== "danger");
  return (
    <div className="pointer-events-none fixed right-4 top-20 z-[70] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
      <div role="alert" aria-live="assertive" className="flex flex-col gap-2">
        <AnimatePresence>
          {urgent.map((t) => (
            <ToastItem key={t.id} t={t} />
          ))}
        </AnimatePresence>
      </div>
      <div role="status" aria-live="polite" className="flex flex-col gap-2">
        <AnimatePresence>
          {polite.map((t) => (
            <ToastItem key={t.id} t={t} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
