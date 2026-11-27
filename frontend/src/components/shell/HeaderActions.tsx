import { motion } from "motion/react";
import { Bell, CircleHelp, LogOut, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { firebaseEnabled, signOut } from "../../lib/auth";
import { cn } from "../../lib/cn";
import { timeAgo } from "../../lib/format";
import { useLiveStatus } from "../../lib/live";
import { LiveIndicator } from "./LiveIndicator";
import { ALERTS_PATH, unreadText } from "./nav";
import { useRefreshAction } from "./useShell";

const ICON_BUTTON = "grid h-9 w-9 place-items-center rounded-xl border hairline bg-black/20 text-muted hover:text-ink";

/** Right-hand side of the app header: help, live status, refresh, notifications and sign-out. */
export function HeaderActions({ fetchedAt, unread, onHelp }: { fetchedAt: string | undefined; unread: number; onHelp: () => void }) {
  const navigate = useNavigate();
  const lastEvent = useLiveStatus((s) => s.lastEventAt);
  const refresh = useRefreshAction();
  return (
    <div className="ml-auto flex items-center gap-2">
      <button
        type="button"
        onClick={onHelp}
        aria-haspopup="dialog"
        aria-label="How to use"
        title="How to use AIRenv"
        className="flex h-9 items-center gap-1.5 rounded-xl border hairline bg-black/20 px-2.5 text-xs text-muted hover:border-mint/30 hover:text-ink"
      >
        <CircleHelp aria-hidden="true" className="h-4 w-4 text-mint" />
        <span aria-hidden="true" className="hidden sm:inline">
          How to use
        </span>
      </button>
      <LiveIndicator />
      {fetchedAt && (
        <span className="hidden text-[11px] text-faint md:inline" title="Time since the backend last fetched data">
          updated {timeAgo(fetchedAt)}
          {lastEvent ? " · live" : ""}
        </span>
      )}
      <button
        type="button"
        onClick={refresh.run}
        className={ICON_BUTTON}
        aria-label="Refresh environmental data"
        aria-busy={refresh.pending || undefined}
        title="Refresh now"
      >
        <RefreshCw aria-hidden="true" className={cn("h-4 w-4", refresh.pending && "text-mint motion-safe:animate-spin")} />
      </button>
      <button
        type="button"
        onClick={() => void navigate(ALERTS_PATH)}
        className={cn("relative", ICON_BUTTON)}
        aria-label={unread > 0 ? `Notifications, ${unreadText(unread)}` : "Notifications"}
      >
        <Bell aria-hidden="true" className="h-4 w-4" />
        {unread > 0 && (
          <motion.span
            aria-hidden="true"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-orange-400 px-1 text-[9px] font-bold text-black"
          >
            {unread}
          </motion.span>
        )}
      </button>
      {firebaseEnabled && (
        <button type="button" onClick={() => void signOut()} className={ICON_BUTTON} aria-label="Sign out" title="Sign out">
          <LogOut aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
