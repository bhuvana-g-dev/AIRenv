import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HISTORY_STORAGE_KEY } from "../../lib/conversation";
import type { AssistantReply } from "../../lib/types";
import { axe, renderWithProviders } from "../../test/utils";
import AssistantPage from "./AssistantPage";

const reply: AssistantReply = {
  answer: "PM2.5 is **high** right now.",
  cards: [],
  uncertainty: "Model estimate.",
  follow_ups: ["When will it improve?"],
  intent: "why",
  generated_by: "rules",
  data_refs: [{ label: "PM2.5", value: 120, unit: "µg/m³" }],
  is_demo: false,
};

vi.mock("../../lib/queries", () => ({
  useBundle: () => ({ data: undefined }),
  useAssistant: () => ({
    isPending: false,
    mutate: (_body: unknown, opts: { onSuccess: (r: AssistantReply) => void }) => opts.onSuccess(reply),
  }),
}));

describe("AssistantPage", () => {
  it("sends a question with Enter and shows the grounded answer", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AssistantPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Environmental assistant" })).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Message AIRenv AI" }), "Why is it hazy?{Enter}");

    const log = screen.getByRole("log", { name: "Conversation with AIRenv AI" });
    expect(log).toHaveTextContent("You said:Why is it hazy?");
    expect(screen.getByText("high", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "When will it improve?" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message AIRenv AI" })).toHaveValue("");
    expect(localStorage.getItem(HISTORY_STORAGE_KEY)).toContain("Why is it hazy?");
  });

  it("asks a suggested question and can clear the history", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AssistantPage />);
    await user.click(screen.getByRole("button", { name: "Is it safe to play outside?" }));
    expect(screen.getByRole("log")).toHaveTextContent("Is it safe to play outside?");
    await user.click(screen.getByRole("button", { name: "Clear history" }));
    expect(screen.getByRole("heading", { name: "Ask about the air around you" })).toBeInTheDocument();
  });

  it("has no detectable axe violations", async () => {
    const { container } = renderWithProviders(<AssistantPage />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
