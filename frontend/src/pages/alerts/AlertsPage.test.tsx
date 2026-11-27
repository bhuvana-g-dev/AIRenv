import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { post } from "../../lib/api";
import type { NotificationItem, Profile } from "../../lib/types";
import { axe, renderWithProviders } from "../../test/utils";
import AlertsPage from "./AlertsPage";

const notification = (over: Partial<NotificationItem>): NotificationItem => ({
  id: "n1",
  key: "k",
  category: "critical",
  severity: "critical",
  priority: 1,
  title: "Severe smog",
  message: "NAQI is above 400.",
  created_at: new Date().toISOString(),
  read: false,
  delivery: { in_app: true, telegram: "not_linked" },
  ...over,
});

const items = [notification({}), notification({ id: "n2", category: "forecast", severity: "medium", title: "Haze tomorrow", read: true })];

vi.mock("../../lib/api", () => ({ post: vi.fn(() => Promise.resolve({})), del: vi.fn(() => Promise.resolve({})) }));
vi.mock("../../lib/queries", () => ({
  useProfile: () => ({
    data: {
      telegram: null,
      notification_prefs: {
        in_app: true,
        telegram: true,
        min_severity: "medium",
        quiet_hours: { enabled: true, start: "22:00", end: "07:00" },
        categories: {},
        daily_limit: 5,
      },
    } as unknown as Profile,
    isSuccess: true,
    isLoading: false,
  }),
  useNotifications: () => ({ data: { items, unread: 1 }, isLoading: false, isError: false }),
}));

describe("AlertsPage", () => {
  beforeEach(() => vi.mocked(post).mockClear());

  it("lists alerts with delivery rules and filters to unread", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AlertsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Alert centre" })).toBeInTheDocument();
    expect(screen.getByText("Severe smog")).toBeInTheDocument();
    expect(screen.getByText("Haze tomorrow")).toBeInTheDocument();
    expect(screen.getByText("on · not linked")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Unread (1)" }));
    expect(screen.getByRole("button", { name: "Unread (1)" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Haze tomorrow")).not.toBeInTheDocument();
  });

  it("marks an alert as read through the API", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AlertsPage />);
    await user.click(screen.getByRole("button", { name: "Mark as read: Severe smog" }));
    expect(post).toHaveBeenCalledWith("/api/notifications/n1/read");
  });

  it("has no detectable axe violations", async () => {
    const { container } = renderWithProviders(<AlertsPage />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
