import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { axe, renderWithProviders } from "../../test/utils";
import CommunityPage from "./CommunityPage";

vi.mock("../../lib/api", () => ({ api: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() }));
vi.mock("../../lib/queries", () => ({
  useCommunities: () => ({ data: { communities: [] }, isLoading: false, isError: false }),
  useCommunityDetail: () => ({ data: undefined, isLoading: false }),
  useBriefing: () => ({ data: undefined }),
}));

describe("CommunityPage", () => {
  it("shows the empty state and opens the create dialog", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CommunityPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Protect the people you organise" })).toBeInTheDocument();
    expect(screen.getByText("No communities yet")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New community" }));
    const dialog = screen.getByRole("dialog", { name: "Create a community" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByRole("button", { name: "Create community" })).toBeDisabled();
  });

  it("has no detectable axe violations", async () => {
    const { container } = renderWithProviders(<CommunityPage />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
