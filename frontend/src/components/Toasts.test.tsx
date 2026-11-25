import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useToasts } from "../lib/store";
import { axe } from "../test/utils";
import { Toasts } from "./Toasts";

describe("Toasts", () => {
  beforeEach(() => useToasts.setState({ toasts: [] }));

  it("has persistent polite and assertive live regions", () => {
    render(<Toasts />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");
  });

  it("routes errors to the alert region and others to the status region", async () => {
    const { container } = render(<Toasts />);
    act(() => {
      useToasts.getState().push({ title: "Data refreshed", message: "Latest provider data processed.", tone: "success" });
      useToasts.getState().push({ title: "Refresh failed", message: "Backend offline", tone: "danger" });
    });
    expect(within(screen.getByRole("status")).getByText("Data refreshed")).toBeInTheDocument();
    expect(within(screen.getByRole("alert")).getByText("Refresh failed")).toBeInTheDocument();
    // tone is conveyed in text, not only by colour/icon
    expect(within(screen.getByRole("alert")).getByText(/Error:/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("dismisses a toast with its labelled close button", async () => {
    render(<Toasts />);
    act(() => useToasts.getState().push({ title: "Saved", tone: "info" }));
    await userEvent.click(screen.getByRole("button", { name: "Dismiss notification: Saved" }));
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    expect(useToasts.getState().toasts).toHaveLength(0);
  });
});
