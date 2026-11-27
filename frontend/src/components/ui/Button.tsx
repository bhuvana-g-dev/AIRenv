import { motion } from "motion/react";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "../../lib/cn";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline" | "danger" | "ai";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
};

const VARIANT_STYLES: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-gradient-to-r from-emerald to-mint text-[#04140d] shadow-[0_8px_30px_-10px_rgba(53,211,153,0.7)] hover:brightness-110",
  ghost: "text-ink/85 hover:bg-white/5 hover:text-ink",
  outline: "border hairline bg-white/[0.02] text-ink hover:border-mint/40 hover:bg-emerald/5",
  danger: "border border-red-400/30 bg-red-500/10 text-red-200 hover:bg-red-500/20",
  ai: "bg-gradient-to-r from-cyan/90 to-violet/90 text-[#060b14] shadow-[0_8px_30px_-10px_rgba(85,214,232,0.6)] hover:brightness-110",
};

const SIZE_STYLES: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-[15px] gap-2",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      whileHover={{ y: -1 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className={cn(
        "inline-flex select-none items-center justify-center rounded-xl font-medium transition-[filter,background,border-color,color] disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT_STYLES[variant],
        SIZE_STYLES[size],
        className,
      )}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...(rest as object)}
    >
      {loading ? <Loader2 aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" /> : icon}
      {children}
    </motion.button>
  );
}
