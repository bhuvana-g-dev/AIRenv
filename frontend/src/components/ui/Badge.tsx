import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export function Badge({ children, color, className, dot }: { children: ReactNode; color?: string; className?: string; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        className,
      )}
      style={color ? { color, borderColor: `${color}40`, background: `${color}14` } : undefined}
    >
      {dot && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: color ?? "currentColor" }} />}
      {children}
    </span>
  );
}
