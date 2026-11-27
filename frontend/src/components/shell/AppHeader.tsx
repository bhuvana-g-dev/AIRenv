import { MapPin, Menu } from "lucide-react";
import type { Location } from "../../lib/types";
import { HeaderActions } from "./HeaderActions";
import { MOBILE_NAV_ID, locationRegion } from "./nav";

interface AppHeaderProps {
  location: Location;
  mobileOpen: boolean;
  fetchedAt: string | undefined;
  unread: number;
  onOpenMenu: () => void;
  onOpenLocation: () => void;
  onOpenHelp: () => void;
}

export function AppHeader({ location, mobileOpen, fetchedAt, unread, onOpenMenu, onOpenLocation, onOpenHelp }: AppHeaderProps) {
  const region = locationRegion(location);
  return (
    <header className="sticky top-0 z-30 border-b hairline bg-bg/70 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-4 md:px-6">
        <button
          type="button"
          className="rounded-lg p-2 text-muted hover:bg-white/5 lg:hidden"
          onClick={onOpenMenu}
          aria-label="Open menu"
          aria-expanded={mobileOpen}
          aria-controls={MOBILE_NAV_ID}
          aria-haspopup="dialog"
        >
          <Menu aria-hidden="true" className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onOpenLocation}
          aria-haspopup="dialog"
          aria-label={`Change location: ${location.name}${region ? `, ${region}` : ""}`}
          className="group flex min-w-0 items-center gap-2 rounded-xl border hairline bg-black/20 px-3 py-2 text-left hover:border-mint/30"
        >
          <MapPin aria-hidden="true" className="h-4 w-4 shrink-0 text-mint" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{location.name}</span>
            <span className="block truncate text-[10px] text-faint">
              {region || `${location.lat.toFixed(2)}, ${location.lon.toFixed(2)}`}
            </span>
          </span>
        </button>
        <HeaderActions fetchedAt={fetchedAt} unread={unread} onHelp={onOpenHelp} />
      </div>
    </header>
  );
}
