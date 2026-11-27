import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useId, useRef, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { useFocusTrap } from "../../lib/useFocusTrap";

interface ModalContentProps {
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  wide?: boolean;
}

function ModalDialog({ onClose, title, children, wide }: ModalContentProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(ref, true, onClose);
  return (
    <motion.div
      className="fixed inset-0 z-[60] grid place-items-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div aria-hidden="true" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        className={cn(
          "glass-strong relative max-h-[88vh] w-full overflow-y-auto rounded-2xl p-6 focus:outline-none",
          wide ? "max-w-2xl" : "max-w-lg",
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="font-display text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-ink"
            aria-label="Close dialog"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

/**
 * Accessible modal dialog: `role="dialog"` + `aria-modal`, labelled by its title, focus
 * moved in and trapped while open, Escape / backdrop click close it, and focus returns to
 * the element that opened it.
 */
export function Modal({ open, ...props }: ModalContentProps & { open: boolean }) {
  return <AnimatePresence>{open && <ModalDialog {...props} />}</AnimatePresence>;
}
