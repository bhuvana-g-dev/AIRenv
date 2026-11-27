import { motion } from "motion/react";
import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "../../lib/cn";
import { nextTabIndex, tabId, tabPanelId } from "../../lib/tabs";

/**
 * Segmented control. With `idPrefix` it is a real ARIA tablist (roving tabindex, arrow /
 * Home / End keys, `aria-controls` → `tabPanelId(idPrefix)`); without it, a group of
 * toggle buttons using `aria-pressed` (for filters and view options with no panel).
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  layoutId,
  label,
  idPrefix,
}: {
  tabs: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  layoutId: string;
  label: string;
  idPrefix?: string;
}) {
  const isTabs = Boolean(idPrefix);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!idPrefix) return;
    const next = nextTabIndex(
      e.key,
      tabs.findIndex((t) => t.value === value),
      tabs.length,
    );
    if (next === null) return;
    e.preventDefault();
    const target = tabs[next];
    onChange(target.value);
    document.getElementById(tabId(idPrefix, target.value))?.focus();
  };
  return (
    <div
      role={isTabs ? "tablist" : "group"}
      aria-label={label}
      onKeyDown={isTabs ? onKeyDown : undefined}
      className="inline-flex max-w-full overflow-x-auto rounded-xl border hairline bg-black/20 p-1"
    >
      {tabs.map((t) => {
        const active = value === t.value;
        return (
          <button
            key={t.value}
            type="button"
            {...(idPrefix
              ? {
                  role: "tab",
                  id: tabId(idPrefix, t.value),
                  "aria-selected": active,
                  "aria-controls": tabPanelId(idPrefix),
                  tabIndex: active ? 0 : -1,
                }
              : { "aria-pressed": active })}
            onClick={() => onChange(t.value)}
            className={cn(
              "relative rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              active ? "text-ink" : "text-muted hover:text-ink",
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                aria-hidden="true"
                className="absolute inset-0 rounded-lg border border-mint/20 bg-emerald/15"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
