import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useRef } from "react";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { MOBILE_NAV_ID } from "./nav";
import { Sidebar } from "./Sidebar";

/** Mobile navigation drawer: a modal dialog with focus trap, Escape to close and focus restore. */
export function MobileDrawer({ open, onClose, unread }: { open: boolean; onClose: () => void; unread: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open, onClose);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            aria-hidden="true"
            className="fixed inset-0 z-40 bg-black/60 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={ref}
            id={MOBILE_NAV_ID}
            role="dialog"
            aria-modal="true"
            aria-label="Main menu"
            tabIndex={-1}
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ type: "spring", stiffness: 360, damping: 36 }}
            className="fixed inset-y-0 left-0 z-50 w-[260px] border-r hairline bg-bg-2 lg:hidden"
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-4 z-10 grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-white/5 hover:text-ink"
              aria-label="Close menu"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
            <Sidebar collapsed={false} onNavigate={onClose} unread={unread} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
