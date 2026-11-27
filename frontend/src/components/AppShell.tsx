import { motion } from "motion/react";
import { useCallback, useRef, useState, type CSSProperties } from "react";
import { useLiveStream } from "../lib/live";
import { useBundle, useNotifications, useProfile } from "../lib/queries";
import { useApp } from "../lib/store";
import { Aurora } from "./effects";
import { HowToUse } from "./HowToUse";
import { LocationModal } from "./LocationPicker";
import { Onboarding } from "./Onboarding";
import { AnimatedOutlet } from "./shell/AnimatedOutlet";
import { AppHeader } from "./shell/AppHeader";
import { MobileDrawer } from "./shell/MobileDrawer";
import { Sidebar } from "./shell/Sidebar";
import { useFocusOnNavigate, useProfileLocation } from "./shell/useShell";
import { SkipLink } from "./SkipLink";
import { Toasts } from "./Toasts";

const SIDEBAR_WIDTH = { collapsed: 84, expanded: 248 };

/** Signed-in application frame: sidebar, header, routed page outlet and global dialogs. */
export function AppShell() {
  const collapsed = useApp((s) => s.sidebarCollapsed);
  const location = useApp((s) => s.location);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [locOpen, setLocOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const profile = useProfile();
  const bundle = useBundle();
  const notifications = useNotifications(profile.isSuccess);
  const mainRef = useRef<HTMLElement>(null);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const closeLocation = useCallback(() => setLocOpen(false), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const chooseLocation = useProfileLocation(profile.data);

  useLiveStream(bundle.data?.snapshot.location.id);
  useFocusOnNavigate(mainRef);

  const sidebarW = collapsed ? SIDEBAR_WIDTH.collapsed : SIDEBAR_WIDTH.expanded;
  const unread = notifications.data?.unread ?? 0;

  return (
    <div className="relative min-h-screen overflow-x-clip bg-bg">
      <SkipLink />
      <Aurora className="fixed opacity-60" intensity={0.7} />
      <div
        className="grid-bg pointer-events-none fixed inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]"
        aria-hidden="true"
      />

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

      <div
        style={{ "--sw": `${sidebarW}px` } as CSSProperties}
        className="relative transition-[padding] duration-300 ease-out lg:pl-[var(--sw)]"
      >
        <AppHeader
          location={location}
          mobileOpen={mobileOpen}
          fetchedAt={bundle.data?.snapshot.fetched_at}
          unread={unread}
          onOpenMenu={() => setMobileOpen(true)}
          onOpenLocation={() => setLocOpen(true)}
          onOpenHelp={() => setHelpOpen(true)}
        />
        <main
          id="main-content"
          ref={mainRef}
          tabIndex={-1}
          className="relative mx-auto max-w-[1440px] px-4 pb-16 pt-6 outline-none md:px-6"
        >
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
