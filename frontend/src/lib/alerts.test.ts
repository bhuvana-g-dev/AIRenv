import { describe, expect, it } from "vitest";
import { alertFilterTabs, deliveryRules, deliveryStatusText, filterAlerts } from "./alerts";
import type { NotificationItem, NotificationPrefs } from "./types";

const item = (id: string, category: NotificationItem["category"], read: boolean) => ({ id, category, read }) as NotificationItem;

describe("filterAlerts", () => {
  const items = [item("a", "critical", false), item("b", "forecast", true), item("c", "critical", true)];

  it("returns everything, unread only, or one category", () => {
    expect(filterAlerts(items, "all")).toHaveLength(3);
    expect(filterAlerts(items, "unread").map((n) => n.id)).toEqual(["a"]);
    expect(filterAlerts(items, "critical").map((n) => n.id)).toEqual(["a", "c"]);
  });
});

describe("alertFilterTabs", () => {
  it("shows the unread count only when there is one", () => {
    expect(alertFilterTabs(3)[1].label).toBe("Unread (3)");
    expect(alertFilterTabs(0)[1].label).toBe("Unread");
    expect(alertFilterTabs(undefined)[1].label).toBe("Unread");
  });
});

describe("deliveryRules", () => {
  const prefs: NotificationPrefs = {
    in_app: true,
    telegram: true,
    min_severity: "medium",
    quiet_hours: { enabled: true, start: "22:00", end: "07:00" },
    categories: {},
    daily_limit: 5,
  };

  it("summarises quiet hours, limits and Telegram link state", () => {
    expect(deliveryRules(prefs, false).map((r) => r.value)).toEqual(["medium", "22:00–07:00 (critical still sent)", 5, "on · not linked"]);
    expect(
      deliveryRules({ ...prefs, telegram: false, quiet_hours: { ...prefs.quiet_hours, enabled: false } }, true).map((r) => r.value),
    ).toEqual(["medium", "off", 5, "off"]);
    expect(deliveryRules(prefs, true)[3].value).toBe("on");
  });
});

describe("deliveryStatusText", () => {
  it("replaces the underscore", () => {
    expect(deliveryStatusText("not_linked")).toBe("not linked");
  });
});
