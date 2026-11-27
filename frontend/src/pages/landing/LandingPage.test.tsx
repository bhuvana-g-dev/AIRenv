import { screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { axe, renderWithProviders } from "../../test/utils";
import LandingPage from "./LandingPage";

vi.mock("../../lib/api", () => ({ api: vi.fn(() => Promise.reject(new Error("offline"))) }));

beforeAll(() => {
  // jsdom has no IntersectionObserver; motion's whileInView needs one.
  if (!("IntersectionObserver" in window)) {
    (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

describe("LandingPage", () => {
  it("renders the sections and labels the fallback sample as demonstration data", async () => {
    renderWithProviders(<LandingPage />, { route: "/about" });
    expect(screen.getByRole("heading", { level: 1, name: "AIRenv" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(await screen.findByText("Demonstration data")).toBeInTheDocument();
    expect(screen.getByText("Live service unreachable")).toHaveAttribute("role", "status");
    expect(screen.getByRole("img", { name: "NAQI 286 out of 500, Poor" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Landing" });
    for (const [name, href] of [
      ["Why", "#why"],
      ["How it works", "#how"],
      ["Intelligence", "#engines"],
      ["Community", "#community"],
      ["Impact", "#impact"],
    ]) {
      expect(within(nav).getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });

  it("has no detectable axe violations", async () => {
    const { container } = renderWithProviders(<LandingPage />, { route: "/about" });
    await screen.findByText("Demonstration data");
    expect(await axe(container)).toHaveNoViolations();
  });
});
