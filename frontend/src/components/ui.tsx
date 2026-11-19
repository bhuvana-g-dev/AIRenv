import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import clsx from "clsx";
import { AlertTriangle, Inbox, Loader2, X } from "lucide-react";
import { useEffect, useId, type ButtonHTMLAttributes, type ReactNode } from "react";

export function cn(...args: Parameters<typeof clsx>) {
  return clsx(...args);
}

/* ------------------------------------------------------------------ Card */
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
      className={cn("glass relative rounded-2xl p-5 transition-shadow duration-300", hover && "hover:shadow-[0_24px_60px_-30px_rgba(53,211,153,0.35)]", className)}
    >
      {children}
    </Comp>
  );
}

export function CardHeader({ icon, title, subtitle, action }: { icon?: ReactNode; title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-[min(100%,220px)] flex-1 items-start gap-3">
        {icon && (
          <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border hairline bg-emerald/5 text-mint">{icon}</div>
        )}
        <div className="min-w-0">
          <h3 className="font-display text-[15px] font-semibold tracking-tight text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ Button */
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline" | "danger" | "ai";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({ variant = "primary", size = "md", loading, icon, className, children, disabled, ...rest }: ButtonProps) {
  const styles = {
    primary: "bg-gradient-to-r from-emerald to-mint text-[#04140d] shadow-[0_8px_30px_-10px_rgba(53,211,153,0.7)] hover:brightness-110",
    ghost: "text-ink/85 hover:bg-white/5 hover:text-ink",
    outline: "border hairline bg-white/[0.02] text-ink hover:border-mint/40 hover:bg-emerald/5",
    danger: "border border-red-400/30 bg-red-500/10 text-red-200 hover:bg-red-500/20",
    ai: "bg-gradient-to-r from-cyan/90 to-violet/90 text-[#060b14] shadow-[0_8px_30px_-10px_rgba(85,214,232,0.6)] hover:brightness-110",
  }[variant];
  const sizes = { sm: "h-8 px-3 text-xs gap-1.5", md: "h-10 px-4 text-sm gap-2", lg: "h-12 px-6 text-[15px] gap-2" }[size];
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      whileHover={{ y: -1 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className={cn(
        "inline-flex select-none items-center justify-center rounded-xl font-medium transition-[filter,background,border-color,color] disabled:cursor-not-allowed disabled:opacity-50",
        styles,
        sizes,
        className,
      )}
      disabled={disabled || loading}
      {...(rest as object)}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </motion.button>
  );
}

/* ------------------------------------------------------------------ Badge */
export function Badge({ children, color, className, dot }: { children: ReactNode; color?: string; className?: string; dot?: boolean }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium", className)}
      style={color ? { color, borderColor: `${color}40`, background: `${color}14` } : undefined}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: color ?? "currentColor" }} />}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ Skeleton */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-xl", className)} aria-hidden />;
}

/* ------------------------------------------------------------------ AnimatedNumber */
export function AnimatedNumber({ value, digits = 0, className }: { value: number | null | undefined; digits?: number; className?: string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => (value == null ? "—" : v.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits })));
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

/* ------------------------------------------------------------------ Toggle */
export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn("flex cursor-pointer items-start justify-between gap-4 py-2.5", disabled && "cursor-not-allowed opacity-50")}>
      <span className="min-w-0">
        <span className="block text-sm text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn("relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors", checked ? "border-emerald/50 bg-emerald/30" : "hairline bg-white/5")}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 600, damping: 35 }}
          className={cn("absolute top-0.5 h-[18px] w-[18px] rounded-full shadow", checked ? "right-0.5 bg-mint" : "left-0.5 bg-muted")}
        />
      </button>
    </label>
  );
}

/* ------------------------------------------------------------------ Tabs */
export function Tabs<T extends string>({ tabs, value, onChange, layoutId }: { tabs: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; layoutId: string }) {
  return (
    <div role="tablist" className="inline-flex max-w-full overflow-x-auto rounded-xl border hairline bg-black/20 p-1">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn("relative rounded-lg px-3 py-1.5 text-xs font-medium transition-colors", value === t.value ? "text-ink" : "text-muted hover:text-ink")}
        >
          {value === t.value && (
            <motion.span layoutId={layoutId} className="absolute inset-0 rounded-lg border border-mint/20 bg-emerald/15" transition={{ type: "spring", stiffness: 500, damping: 38 }} />
          )}
          <span className="relative">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ Modal */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[60] grid place-items-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className={cn("glass-strong relative max-h-[88vh] w-full overflow-y-auto rounded-2xl p-6", wide ? "max-w-2xl" : "max-w-lg")}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">{title}</h2>
              <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-ink" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ States */
export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl border hairline bg-emerald/5 text-mint">{icon ?? <Inbox className="h-5 w-5" />}</div>
      <p className="font-display text-sm font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", message, action }: { title?: string; message?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl border border-orange-400/25 bg-orange-400/10 text-orange-300">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <p className="font-display text-sm font-semibold">{title}</p>
      {message && <p className="mt-1 max-w-md text-xs leading-relaxed text-muted">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow && <p className="label mb-2 text-mint/80">{eyebrow}</p>}
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-[28px]">{title}</h1>
        {description && <div className="mt-1.5 max-w-2xl text-sm text-muted">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-faint">{hint}</span>}
    </label>
  );
}
