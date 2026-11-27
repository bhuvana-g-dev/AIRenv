import { motion } from "motion/react";
import { useId, type ReactNode } from "react";
import { cn } from "../../lib/cn";

/** Labelled on/off switch (`role="switch"`), with an optional description linked by `aria-describedby`. */
export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  const labelId = `${id}-label`;
  const descId = `${id}-desc`;
  return (
    <label
      htmlFor={id}
      className={cn("flex cursor-pointer items-start justify-between gap-4 py-2.5", disabled && "cursor-not-allowed opacity-50")}
    >
      <span className="min-w-0">
        <span id={labelId} className="block text-sm text-ink">
          {label}
        </span>
        {description && (
          <span id={descId} className="mt-0.5 block text-xs text-muted">
            {description}
          </span>
        )}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={description ? descId : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors",
          checked ? "border-emerald/50 bg-emerald/30" : "hairline bg-white/5",
        )}
      >
        <motion.span
          layout
          aria-hidden="true"
          transition={{ type: "spring", stiffness: 600, damping: 35 }}
          className={cn("absolute top-0.5 h-[18px] w-[18px] rounded-full shadow", checked ? "right-0.5 bg-mint" : "left-0.5 bg-muted")}
        />
      </button>
    </label>
  );
}
