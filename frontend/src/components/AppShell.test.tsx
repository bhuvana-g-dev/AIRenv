import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useApp } from "../lib/store";
import { axe, renderWithProviders } from "../test/utils";
import { AppShell } from "./AppShell";

// Data and real-time hooks are mocked so the shell renders deterministically without network.
vi.mock("../lib/queries", () => {
  const idle = { mutate: vi.fn(), isPending: false };
  return {
    useProfile: () => ({ data: undefined, isSuccess: false }),
    useUpdateProfile: () => idle,
    useBundle: () => ({ data: undefined }),
    useRefresh: () => idle,
    useNotifications: () => ({ data: { items: [], unread: 3 } }),
  };
});
vi.mock("../lib/live", () => ({
  useLiveStream: () => undefined,
  useLiveStatus: (sel: (s: { status: string; lastEventAt: number | null }) => unknown) => sel({ status: "live", lastEventAt: null }),
}));
vi.mock("../lib/auth", () => ({ firebaseEnabled: false, signOut: vi.fn() }));

function renderShell() {
  return renderWithProviders(
    <Routes>
      <Route path="/app" element={<AppShell />}>
        <Route index element={<h1>Dashboard page</h1>} />
      </Route>
    </Routes>,
    { route: "/app" },
  );
}

describe("AppShell", () => {
  beforeEach(() => {
    useApp.setState({
      location: { id: "x", name: "New Delhi", lat: 28.6, lon: 77.2, admin1: "Delhi", country: "India" },
      sidebarCollapsed: false,
      locationFromProfile: true,
    });
  });

  it("starts with a skip link that moves focus to the main content", async () => {
    const user = userEvent.setup();
    renderShell();
    await user.tab();
    const skip = screen.getByRole("link", { name: "Skip to main content" });
    expect(skip).toHaveFocus();
    await user.keyboard("{Enter}");
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main-content");
    expect(main).toHaveFocus();
    expect(within(main).getByRole("heading", { level: 1, name: "Dashboard page" })).toBeInTheDocument();
  });

  it("gives icon buttons and badges accessible names", () => {
    renderShell();
    expect(screen.getByRole("button", { name: "Change location: New Delhi, Delhi, India" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notifications, 3 unread" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh environmental data" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Alerts, 3 unread" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Intelligence" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText(/Real-time updates:/).closest('[role="status"]')).toHaveTextContent("Real-time updates: Live");
  });

  it("opens the mobile menu as a modal dialog with focus management", async () => {
    const user = userEvent.setup();
    renderShell();
    const menuButton = screen.getByRole("button", { name: "Open menu" });
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    await user.click(menuButton);

    const drawer = screen.getByRole("dialog", { name: "Main menu" });
    expect(drawer).toHaveAttribute("aria-modal", "true");
    expect(menuButton).toHaveAttribute("aria-expanded", "true");
    expect(menuButton).toHaveAttribute("aria-controls", drawer.id);
    expect(drawer).toContainElement(document.activeElement as HTMLElement);
    expect(within(drawer).getByRole("navigation", { name: "Main" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Main menu" })).not.toBeInTheDocument();
    expect(menuButton).toHaveFocus();
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
  });

  it("closes the mobile menu from its close button", async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await user.click(screen.getByRole("button", { name: "Close menu" }));
    expect(screen.queryByRole("dialog", { name: "Main menu" })).not.toBeInTheDocument();
  });

  it("opens the location dialog from the header", async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole("button", { name: /Change location/ }));
    expect(screen.getByRole("dialog", { name: "Choose location" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search location" })).toHaveFocus();
  });

  it("opens the how-to-use guide from the header", async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole("button", { name: "How to use" }));
    const dialog = screen.getByRole("dialog", { name: "How to use AIRenv" });
    expect(within(dialog).getByRole("link", { name: /Learn how AIRenv works/ })).toHaveAttribute("href", "/about");
  });

  it("has no detectable axe violations", async () => {
    const { container } = renderShell();
    expect(await axe(container)).toHaveNoViolations();
  });
});
