import { motion } from "motion/react";
import { ChevronsLeft, Leaf } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { cn } from "../../lib/cn";
import { useApp } from "../../lib/store";
import { Logo } from "../effects";
import { ALERTS_PATH, NAV, badgeCount, navLinkLabel, type NavItem } from "./nav";

function NavEntry({ item, collapsed, unread, onNavigate }: { item: NavItem; collapsed: boolean; unread: number; onNavigate?: () => void }) {
  const hasBadge = item.to === ALERTS_PATH && unread > 0;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      aria-label={navLinkLabel(item, unread, collapsed)}
      className={({ isActive }) =>
        cn(
          "group relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm transition-colors",
          isActive ? "text-ink" : "text-muted hover:bg-white/[0.03] hover:text-ink",
          collapsed && "justify-center px-0",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              aria-hidden="true"
              layoutId="nav-active"
              className="absolute inset-0 rounded-xl border border-mint/15 bg-gradient-to-r from-emerald/15 to-transparent"
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
            />
          )}
          <item.icon aria-hidden="true" className={cn("relative h-[18px] w-[18px] shrink-0", isActive && "text-mint")} />
          {!collapsed && <span className="relative">{item.label}</span>}
          {hasBadge && (
            <span
              aria-hidden="true"
              className={cn(
                "relative ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-orange-400/90 px-1.5 text-[10px] font-semibold text-black",
                collapsed && "absolute right-1.5 top-1.5 ml-0 h-4 min-w-4 text-[9px]",
              )}
            >
              {badgeCount(unread)}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

export function Sidebar({ collapsed, onNavigate, unread }: { collapsed: boolean; onNavigate?: () => void; unread: number }) {
  const toggle = useApp((s) => s.toggleSidebar);
  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-16 items-center px-4", collapsed ? "justify-center" : "justify-between")}>
        <Link to="/app" onClick={onNavigate} aria-label="AIRenv home">
          <Logo withText={!collapsed} />
        </Link>
      </div>
      <nav className="mt-2 flex-1 space-y-1 px-3" aria-label="Main">
        {NAV.map((item) => (
          <NavEntry key={item.to} item={item} collapsed={collapsed} unread={unread} onNavigate={onNavigate} />
        ))}
      </nav>
      <div className="space-y-2 p-3">
        {!collapsed && (
          <div className="rounded-xl border hairline bg-black/20 p-3 text-[11px] leading-relaxed text-muted">
            <Leaf aria-hidden="true" className="mb-1.5 h-4 w-4 text-mint" />
            AIRenv monitors in the background. You don't need to check in or log activities.
          </div>
        )}
        {!onNavigate && (
          <button
            type="button"
            onClick={toggle}
            className="hidden h-10 w-full items-center justify-center gap-2 rounded-xl text-xs text-muted hover:bg-white/5 hover:text-ink lg:flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <motion.span aria-hidden="true" animate={{ rotate: collapsed ? 180 : 0 }}>
              <ChevronsLeft aria-hidden="true" className="h-4 w-4" />
            </motion.span>
            {!collapsed && <span aria-hidden="true">Collapse</span>}
          </button>
        )}
      </div>
    </div>
  );
}
