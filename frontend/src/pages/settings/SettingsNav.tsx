import { motion } from "motion/react";
import { cn } from "../../lib/cn";
import { SECTIONS } from "./constants";

/** In-page section links (desktop only); highlights the last section the user jumped to. */
export function SettingsNav({ active, onSelect }: { active: string; onSelect: (id: string) => void }) {
  return (
    <nav className="hidden lg:block" aria-label="Settings sections">
      <ul className="sticky top-24 space-y-1">
        {SECTIONS.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              onClick={() => onSelect(s.id)}
              aria-current={active === s.id ? "true" : undefined}
              className={cn(
                "relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm",
                active === s.id ? "text-ink" : "text-muted hover:text-ink",
              )}
            >
              {active === s.id && (
                <motion.span aria-hidden="true" layoutId="settings-nav" className="absolute inset-0 rounded-xl bg-emerald/10" />
              )}
              <s.icon aria-hidden="true" className="relative h-4 w-4" />
              <span className="relative">{s.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
