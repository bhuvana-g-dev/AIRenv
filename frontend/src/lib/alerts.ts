import { AlertOctagon, Brain, CloudRain, Leaf, TrendingUp, Users, type LucideIcon } from "lucide-react";
import type { NotificationItem, NotificationPrefs } from "./types";

export type AlertCategory = NotificationItem["category"];
export type AlertFilter = "all" | "unread" | AlertCategory;

export const ALERT_CATEGORIES: Record<AlertCategory, { label: string; icon: LucideIcon }> = {
  critical: { label: "Critical environmental alert", icon: AlertOctagon },
  deterioration: { label: "Pollution deterioration", icon: TrendingUp },
  forecast: { label: "Forecast warning", icon: CloudRain },
  community: { label: "School & community activity", icon: Users },
  recommendation: { label: "AI recommendation", icon: Brain },
  positive: { label: "Positive development", icon: Leaf },
};

/** Per-category cooldown between repeated alerts, as enforced by the backend. */
export const COOLDOWNS: Record<AlertCategory, string> = {
  critical: "2 h",
  deterioration: "3 h",
  forecast: "6 h",
  community: "1 h",
  recommendation: "12 h",
  positive: "6 h",
};

export function filterAlerts(items: NotificationItem[], filter: AlertFilter): NotificationItem[] {
  if (filter === "all") return items;
  if (filter === "unread") return items.filter((n) => !n.read);
  return items.filter((n) => n.category === filter);
}

export function alertFilterTabs(unread: number | undefined): { value: AlertFilter; label: string }[] {
  return [
    { value: "all", label: "All" },
    { value: "unread", label: `Unread${unread ? ` (${unread})` : ""}` },
    { value: "critical", label: "Critical" },
    { value: "deterioration", label: "Deterioration" },
    { value: "forecast", label: "Forecast" },
    { value: "community", label: "Community" },
    { value: "positive", label: "Positive" },
  ];
}

/** "not linked" from the API's "not_linked" style delivery status. */
export function deliveryStatusText(status: string): string {
  return status.replace("_", " ");
}

/** The user's delivery rules as label/value rows for the side panel. */
export function deliveryRules(prefs: NotificationPrefs, telegramLinked: boolean): { label: string; value: string | number }[] {
  const quiet = prefs.quiet_hours;
  return [
    { label: "Minimum severity", value: prefs.min_severity },
    { label: "Quiet hours", value: quiet.enabled ? `${quiet.start}–${quiet.end} (critical still sent)` : "off" },
    { label: "Daily limit (non-critical)", value: prefs.daily_limit },
    { label: "Telegram", value: prefs.telegram ? (telegramLinked ? "on" : "on · not linked") : "off" },
  ];
}
