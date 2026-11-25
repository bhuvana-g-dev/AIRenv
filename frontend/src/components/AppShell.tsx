import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Bell,
  Bot,
  ChevronsLeft,
  CircleHelp,
  LayoutDashboard,
  Leaf,
  LogOut,
  Map as MapIcon,
  MapPin,
  Menu,
  RefreshCw,
  Settings,
  Sprout,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate, useOutlet } from "react-router-dom";
import { firebaseEnabled, signOut } from "../lib/auth";
import { useLiveStatus, useLiveStream } from "../lib/live";
import { useBundle, useNotifications, useProfile, useRefresh, useUpdateProfile } from "../lib/queries";
import { useApp, useToasts } from "../lib/store";
import type { Location } from "../lib/types";
import { timeAgo } from "../lib/format";
import { useFocusTrap } from "../lib/useFocusTrap";
import { Aurora, Logo } from "./effects";
import { HowToUse } from "./HowToUse";
import { LocationModal } from "./LocationPicker";
import { Onboarding } from "./Onboarding";
import { SkipLink } from "./SkipLink";
import { Toasts } from "./Toasts";
import { cn } from "../lib/cn";

const NAV = [
  { to: "/app", label: "Intelligence", icon: LayoutDashboard, end: true },
  { to: "/app/map", label: "Air Map", icon: MapIcon },
  { to: "/app/assistant", label: "AIRenv AI", icon: Bot },
  { to: "/app/community", label: "Community", icon: Users },
  { to: "/app/impact", label: "Impact", icon: Sprout },
  { to: "/app/alerts", label: "Alerts", icon: Bell },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

const MOBILE_NAV_ID = "mobile-navigation";

function LiveIndicator() {
  const status = useLiveStatus((s) => s.status);
  const c = status === "live" ? "#35D399" : status === "connecting" ? "#FACC15" : "#FB923C";
  const label = status === "live" ? "Live" : status === "connecting" ? "Connecting" : "Reconnecting";
  return (
    <span
      role="status"
      className="hidden items-center gap-2 rounded-full border hairline bg-black/20 px-2.5 py-1 text-[11px] text-muted sm:inline-flex"
      title="Real-time update channel (Server-Sent Events)"
    >
      <span className="relative flex h-2 w-2" aria-hidden="true">
        {status === "live" && <span className="absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping" style={{ background: c }} />}
        <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: c }} />
      </span>
      <span className="sr-only">Real-time updates: </span>
      {label}
    </span>
  );
}

function unreadText(unread: number) {
  return `${unread} unread`;
}

function Sidebar({ collapsed, onNavigate, unread }: { collapsed: boolean; onNavigate?: () => void; unread: number }) {
  const toggle = useApp((s) => s.toggleSidebar);
  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-16 items-center px-4", collapsed ? "justify-center" : "justify-between")}>
        <Link to="/app" onClick={onNavigate} aria-label="AIRenv home">
          <Logo withText={!collapsed} />
        </Link>
      </div>
      <nav className="mt-2 flex-1 space-y-1 px-3" aria-label="Main">
        {NAV.map((item) => {
          const hasBadge = item.to === "/app/alerts" && unread > 0;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              aria-label={hasBadge ? `${item.label}, ${unreadText(unread)}` : collapsed ? item.label : undefined}
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
                  {isActive && <motion.span aria-hidden="true" layoutId="nav-active" className="absolute inset-0 rounded-xl border border-mint/15 bg-gradient-to-r from-emerald/15 to-transparent" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                  <item.icon aria-hidden="true" className={cn("relative h-[18px] w-[18px] shrink-0", isActive && "text-mint")} />
                  {!collapsed && <span className="relative">{item.label}</span>}
                  {hasBadge && (
                    <span aria-hidden="true" className={cn("relative ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-orange-400/90 px-1.5 text-[10px] font-semibold text-black", collapsed && "absolute right-1.5 top-1.5 ml-0 h-4 min-w-4 text-[9px]")}>
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
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

/** Mobile navigation drawer: a modal dialog with focus trap, Escape to close and focus restore. */
function MobileDrawer({ open, onClose, unread }: { open: boolean; onClose: () => void; unread: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open, onClose);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div aria-hidden="true" className="fixed inset-0 z-40 bg-black/60 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
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
            <button type="button" onClick={onClose} className="absolute right-3 top-4 z-10 grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-white/5 hover:text-ink" aria-label="Close menu">
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
            <Sidebar collapsed={false} onNavigate={onClose} unread={unread} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function AnimatedOutlet() {
  const outlet = useOutlet();
  const loc = useLocation();
  const reduce = useReducedMotion();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={loc.pathname}
        initial={reduce ? false : { opacity: 0, y: 12, filter: "blur(4px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={reduce ? undefined : { opacity: 0, y: -8, filter: "blur(4px)" }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      >
        {outlet}
      </motion.div>
    </AnimatePresence>
  );
}

export function AppShell() {
  const collapsed = useApp((s) => s.sidebarCollapsed);
  const location = useApp((s) => s.location);
  const setLocation = useApp((s) => s.setLocation);
  const fromProfile = useApp((s) => s.locationFromProfile);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [locOpen, setLocOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const profile = useProfile();
  const update = useUpdateProfile();
  const bundle = useBundle();
  const refresh = useRefresh();
  const notifications = useNotifications(profile.isSuccess);
  const push = useToasts((s) => s.push);
  const navigate = useNavigate();
  const lastEvent = useLiveStatus((s) => s.lastEventAt);
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const closeLocation = useCallback(() => setLocOpen(false), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);

  useLiveStream(bundle.data?.snapshot.location.id);

  // Adopt the saved profile location once per session.
  useEffect(() => {
    if (profile.data && !fromProfile) setLocation(profile.data.location, true);
  }, [profile.data, fromProfile, setLocation]);

  // On client-side navigation, move focus to the new page so screen readers start at its content.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  const chooseLocation = (l: Location) => {
    setLocation(l, true);
    if (profile.data) update.mutate({ location: l });
  };

  const sidebarW = collapsed ? 84 : 248;
  const unread = notifications.data?.unread ?? 0;
  const region = [location.admin1, location.country].filter(Boolean).join(", ");

  return (
    <div className="relative min-h-screen overflow-x-clip bg-bg">
      <SkipLink />
      <Aurora className="fixed opacity-60" intensity={0.7} />
      <div className="grid-bg pointer-events-none fixed inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" aria-hidden="true" />

      {/* Desktop sidebar */}
      <motion.aside
        aria-label="Sidebar"
        animate={{ width: sidebarW }}
        transition={{ type: "spring", stiffness: 300, damping: 34 }}
        className="fixed inset-y-0 left-0 z-40 hidden border-r hairline bg-bg-2/80 backdrop-blur-xl lg:block"
      >
        <Sidebar collapsed={collapsed} unread={unread} />
      </motion.aside>

      <MobileDrawer open={mobileOpen} onClose={closeMobile} unread={unread} />

      <div style={{ ["--sw" as string]: `${sidebarW}px` }} className="relative transition-[padding] duration-300 ease-out lg:pl-[var(--sw)]">
        <header className="sticky top-0 z-30 border-b hairline bg-bg/70 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-3 px-4 md:px-6">
            <button
              type="button"
              className="rounded-lg p-2 text-muted hover:bg-white/5 lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              aria-expanded={mobileOpen}
              aria-controls={MOBILE_NAV_ID}
              aria-haspopup="dialog"
            >
              <Menu aria-hidden="true" className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => setLocOpen(true)}
              aria-haspopup="dialog"
              aria-label={`Change location: ${location.name}${region ? `, ${region}` : ""}`}
              className="group flex min-w-0 items-center gap-2 rounded-xl border hairline bg-black/20 px-3 py-2 text-left hover:border-mint/30"
            >
              <MapPin aria-hidden="true" className="h-4 w-4 shrink-0 text-mint" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{location.name}</span>
                <span className="block truncate text-[10px] text-faint">{region || `${location.lat.toFixed(2)}, ${location.lon.toFixed(2)}`}</span>
              </span>
            </button>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setHelpOpen(true)}
                aria-haspopup="dialog"
                aria-label="How to use"
                title="How to use AIRenv"
                className="flex h-9 items-center gap-1.5 rounded-xl border hairline bg-black/20 px-2.5 text-xs text-muted hover:border-mint/30 hover:text-ink"
              >
                <CircleHelp aria-hidden="true" className="h-4 w-4 text-mint" />
                <span aria-hidden="true" className="hidden sm:inline">How to use</span>
              </button>
              <LiveIndicator />
              {bundle.data && (
                <span className="hidden text-[11px] text-faint md:inline" title="Time since the backend last fetched data">
                  updated {timeAgo(bundle.data.snapshot.fetched_at)}
                  {lastEvent ? " · live" : ""}
                </span>
              )}
              <button
                type="button"
                onClick={() =>
                  refresh.mutate(undefined, {
                    onSuccess: () => push({ title: "Data refreshed", message: "Latest provider data processed.", tone: "success" }),
                    onError: (e) => push({ title: "Refresh failed", message: (e as Error).message, tone: "danger" }),
                  })
                }
                className="grid h-9 w-9 place-items-center rounded-xl border hairline bg-black/20 text-muted hover:text-ink"
                aria-label="Refresh environmental data"
                aria-busy={refresh.isPending || undefined}
                title="Refresh now"
              >
                <RefreshCw aria-hidden="true" className={cn("h-4 w-4", refresh.isPending && "text-mint motion-safe:animate-spin")} />
              </button>
              <button
                type="button"
                onClick={() => navigate("/app/alerts")}
                className="relative grid h-9 w-9 place-items-center rounded-xl border hairline bg-black/20 text-muted hover:text-ink"
                aria-label={unread > 0 ? `Notifications, ${unreadText(unread)}` : "Notifications"}
              >
                <Bell aria-hidden="true" className="h-4 w-4" />
                {unread > 0 && (
                  <motion.span aria-hidden="true" initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-orange-400 px-1 text-[9px] font-bold text-black">
                    {unread}
                  </motion.span>
                )}
              </button>
              {firebaseEnabled && (
                <button type="button" onClick={() => void signOut()} className="grid h-9 w-9 place-items-center rounded-xl border hairline bg-black/20 text-muted hover:text-ink" aria-label="Sign out" title="Sign out">
                  <LogOut aria-hidden="true" className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </header>
        <main id="main-content" ref={mainRef} tabIndex={-1} className="relative mx-auto max-w-[1440px] px-4 pb-16 pt-6 outline-none md:px-6">
          <AnimatedOutlet />
        </main>
      </div>

      <LocationModal open={locOpen} onClose={closeLocation} onSelect={chooseLocation} />
      <HowToUse open={helpOpen} onClose={closeHelp} />
      {profile.data && !profile.data.onboarded && <Onboarding profile={profile.data} />}
      <Toasts />
    </div>
  );
}
