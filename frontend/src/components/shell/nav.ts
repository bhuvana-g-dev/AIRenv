import { Bell, Bot, LayoutDashboard, Map as MapIcon, Settings, Sprout, Users, type LucideIcon } from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export const NAV: NavItem[] = [
  { to: "/app", label: "Intelligence", icon: LayoutDashboard, end: true },
  { to: "/app/map", label: "Air Map", icon: MapIcon },
  { to: "/app/assistant", label: "AIRenv AI", icon: Bot },
  { to: "/app/community", label: "Community", icon: Users },
  { to: "/app/impact", label: "Impact", icon: Sprout },
  { to: "/app/alerts", label: "Alerts", icon: Bell },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

export const ALERTS_PATH = "/app/alerts";
export const MOBILE_NAV_ID = "mobile-navigation";

export function unreadText(unread: number): string {
  return `${unread} unread`;
}

/** Compact count for the sidebar badge; anything above nine collapses to "9+". */
export function badgeCount(unread: number): string {
  return unread > 9 ? "9+" : String(unread);
}

/** Accessible name for a nav link: adds the unread count to Alerts, and names icon-only links when collapsed. */
export function navLinkLabel(item: NavItem, unread: number, collapsed: boolean): string | undefined {
  if (item.to === ALERTS_PATH && unread > 0) return `${item.label}, ${unreadText(unread)}`;
  return collapsed ? item.label : undefined;
}

/** Secondary line under the location name: region if known, else coordinates. */
export function locationRegion(location: { admin1?: string | null; country?: string | null }): string {
  return [location.admin1, location.country].filter(Boolean).join(", ");
}
