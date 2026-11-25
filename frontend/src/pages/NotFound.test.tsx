import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe, renderWithProviders } from "../test/utils";
import NotFound from "./NotFound";

describe("NotFound page", () => {
  it("has one h1, a main landmark and a way back", async () => {
    const { container } = renderWithProviders(<NotFound />, { route: "/missing" });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveAccessibleName(/page not found/i);
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the dashboard" })).toHaveAttribute("href", "/app");
    expect(screen.getByRole("link", { name: "AIRenv home" })).toHaveAttribute("href", "/");
    expect(await axe(container)).toHaveNoViolations();
  });
});
