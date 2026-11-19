import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Bell,
  Bot,
  ChevronsLeft,
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
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate, useOutlet } from "react-router-dom";
import { firebaseEnabled, signOut } from "../lib/auth";
import { useLiveStatus, useLiveStream } from "../lib/live";
import { useBundle, useNotifications, useProfile, useRefresh, useUpdateProfile } from "../lib/queries";
import { useApp, useToasts } from "../lib/store";
import type { Location } from "../lib/types";
import { timeAgo } from "../lib/format";
import { Aurora, Logo } from "./effects";
import { LocationModal } from "./LocationPicker";
import { Onboarding } from "./Onboarding";
import { Toasts } from "./Toasts";
import { cn } from "./ui";

const NAV = [
  { to: "/app", label: "Intelligence", icon: LayoutDashboard, end: true },
  { to: "/app/map", label: "Air Map", icon: MapIcon },
  { to: "/app/assistant", label: "AIRenv AI", icon: Bot },
  { to: "/app/community", label: "Community", icon: Users },
  { to: "/app/impact", label: "Impact", icon: Sprout },
  { to: "/app/alerts", label: "Alerts", icon: Bell },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

function LiveIndicator() {
  const status = useLiveStatus((s) => s.status);
  const c = status === "live" ? "#35D399" : status === "connecting" ? "#FACC15" : "#FB923C";
  const label = status === "live" ? "Live" : status === "connecting" ? "Connecting" : "Reconnecting";
  return (
    <span className="hidden items-center gap-2 rounded-full border hairline bg-black/20 px-2.5 py-1 text-[11px] text-muted sm:inline-flex" title="Real-time update channel (Server-Sent Events)">
      <span className="relative flex h-2 w-2">
        {status === "live" && <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: c }} />}
        <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: c }} />
      </span>
      {label}
    </span>
  );
}

function Sidebar({ collapsed, onNavigate, unread }: { collapsed: boolean; onNavigate?: () => void; unread: number }) {
  const toggle = useApp((s) => s.toggleSidebar);
  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-16 items-center px-4", collapsed ? "justify-center" : "justify-between")}>
        <NavLink to="/" onClick={onNavigate} aria-label="AIRenv home">
          <Logo withText={!collapsed} />
        </NavLink>
      </div>
      <nav className="mt-2 flex-1 space-y-1 px-3" aria-label="Main">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
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
                {isActive && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl border border-mint/15 bg-gradient-to-r from-emerald/15 to-transparent" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                <item.icon className={cn("relative h-[18px] w-[18px] shrink-0", isActive && "text-mint")} />
                {!collapsed && <span className="relative">{item.label}</span>}
                {item.to === "/app/alerts" && unread > 0 && (
                  <span className={cn("relative ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-orange-400/90 px-1.5 text-[10px] font-semibold text-black", collapsed && "absolute right-1.5 top-1.5 ml-0 h-4 min-w-4 text-[9px]")}>{unread > 9 ? "9+" : unread}</span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="space-y-2 p-3">
        {!collapsed && (
          <div className="rounded-xl border hairline bg-black/20 p-3 text-[11px] leading-relaxed text-muted">
            <Leaf className="mb-1.5 h-4 w-4 text-mint" />
            AIRenv monitors in the background. You don't need to check in or log activities.
          </div>
        )}
        <button onClick={toggle} className="hidden h-10 w-full items-center justify-center gap-2 rounded-xl text-xs text-muted hover:bg-white/5 hover:text-ink lg:flex" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          <motion.span animate={{ rotate: collapsed ? 180 : 0 }}>
            <ChevronsLeft className="h-4 w-4" />
          </motion.span>
          {!collapsed && "Collapse"}
        </button>
      </div>
    </div>
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
  const profile = useProfile();
  const update = useUpdateProfile();
  const bundle = useBundle();
  const refresh = useRefresh();
  const notifications = useNotifications(profile.isSuccess);
  const push = useToasts((s) => s.push);
  const navigate = useNavigate();
  const lastEvent = useLiveStatus((s) => s.lastEventAt);

  useLiveStream(bundle.data?.snapshot.location.id);

  // Adopt the saved profile location once per session.
  useEffect(() => {
    if (profile.data && !fromProfile) setLocation(profile.data.location, true);
  }, [profile.data, fromProfile, setLocation]);

  const chooseLocation = (l: Location) => {
    setLocation(l, true);
    if (profile.data) update.mutate({ location: l });
  };

  const sidebarW = collapsed ? 84 : 248;

  return (
    <div className="relative min-h-screen overflow-x-clip bg-bg">
      <Aurora className="fixed opacity-60" intensity={0.7} />
      <div className="grid-bg pointer-events-none fixed inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" aria-hidden />

      {/* Desktop sidebar */}
      <motion.aside animate={{ width: sidebarW }} transition={{ type: "spring", stiffness: 300, damping: 34 }} className="fixed inset-y-0 left-0 z-40 hidden border-r hairline bg-bg-2/80 backdrop-blur-xl lg:block">
        <Sidebar collapsed={collapsed} unread={notifications.data?.unread ?? 0} />
      </motion.aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-black/60 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)} />
            <motion.aside initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: "spring", stiffness: 360, damping: 36 }} className="fixed inset-y-0 left-0 z-50 w-[260px] border-r hairline bg-bg-2 lg:hidden">
              <Sidebar collapsed={false} onNavigate={() => setMobileOpen(false)} unread={notifications.data?.unread ?? 0} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div style={{ ["--sw" as string]: `${sidebarW}px` }} className="relative transition-[padding] duration-300 ease-out lg:pl-[var(--sw)]">
        <header className="sticky top-0 z-30 border-b hairline bg-bg/70 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-3 px-4 md:px-6">
            <button className="rounded-lg p-2 text-muted hover:bg-white/5 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <button onClick={() => setLocOpen(true)} className="group flex min-w-0 items-center gap-2 rounded-xl border hairline bg-black/20 px-3 py-2 text-left hover:border-mint/30">
              <MapPin className="h-4 w-4 shrink-0 text-mint" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{location.name}</span>
                <span className="block truncate text-[10px] text-faint">{[location.admin1, location.country].filter(Boolean).join(", ") || `${location.lat.toFixed(2)}, ${location.lon.toFixed(2)}`}</span>
              </span>
            </button>
            <div className="ml-auto flex items-center gap-2">
              <LiveIndicator />
              {bundle.data && (
                <span className="hidden text-[11px] text-faint md:inline" title="Time since the backend last fetched data">
                  updated {timeAgo(bundle.data.snapshot.fetched_at)}
                  {lastEvent ? " · live" : ""}
                </span>
              )}
              <button
                onClick={() =>
                  refresh.mutate(undefined, {
                    onSuccess: () => push({ title: "Data refreshed", message: "Latest provider data processed.", tone: "success" }),
                    onError: (e) => push({ title: "Refresh failed", message: (e as Error).message, tone: "danger" }),
                  })
                }
                className="grid h-9 w-9 place-items-center rounded-xl border hairline bg-black/20 text-muted hover:text-ink"
                aria-label="Refresh environmental data"
                title="Refresh now"
              >
                <RefreshCw className={cn("h-4 w-4", refresh.isPending && "animate-spin text-mint")} />
              </button>
              <button onClick={() => navigate("/app/alerts")} className="relative grid h-9 w-9 place-items-center rounded-xl border hairline bg-black/20 text-muted hover:text-ink" aria-label="Notifications">
                <Bell className="h-4 w-4" />
                {(notifications.data?.unread ?? 0) > 0 && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-orange-400 px-1 text-[9px] font-bold text-black">{notifications.data!.unread}</motion.span>}
              </button>
              {firebaseEnabled && (
                <button onClick={() => void signOut()} className="grid h-9 w-9 place-items-center rounded-xl border hairline bg-black/20 text-muted hover:text-ink" aria-label="Sign out" title="Sign out">
                  <LogOut className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </header>
        <main className="relative mx-auto max-w-[1440px] px-4 pb-16 pt-6 md:px-6">
          <AnimatedOutlet />
        </main>
      </div>

      <LocationModal open={locOpen} onClose={() => setLocOpen(false)} onSelect={chooseLocation} />
      {profile.data && !profile.data.onboarded && <Onboarding profile={profile.data} />}
      <Toasts />
    </div>
  );
}
