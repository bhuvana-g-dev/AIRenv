import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "../test/utils";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  LoadingRegion,
  Modal,
  PageHeader,
  Skeleton,
  Tabs,
  Toggle,
} from "./ui";
import { tabPanelId } from "../lib/tabs";

describe("Button", () => {
  it("defaults to type=button and reports busy state while loading", async () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Save</Button>);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toHaveAttribute("type", "button");
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
  });

  it("supports icon-only buttons with an accessible name", async () => {
    const { container } = render(<Button aria-label="Send message" icon={<svg aria-hidden="true" />} />);
    expect(screen.getByRole("button", { name: "Send message" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("Toggle", () => {
  function Harness({ disabled }: { disabled?: boolean }) {
    const [on, setOn] = useState(false);
    return <Toggle label="Quiet hours" description="Only critical alerts at night" checked={on} onChange={setOn} disabled={disabled} />;
  }

  it("is a labelled switch that toggles with click and keyboard", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    const sw = screen.getByRole("switch", { name: "Quiet hours" });
    expect(sw).toHaveAccessibleDescription("Only critical alerts at night");
    expect(sw).toHaveAttribute("aria-checked", "false");
    await user.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "true");
    sw.focus();
    await user.keyboard(" ");
    expect(sw).toHaveAttribute("aria-checked", "false");
    await user.click(screen.getByText("Quiet hours")); // clicking the label toggles too
    expect(sw).toHaveAttribute("aria-checked", "true");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("cannot be changed when disabled", async () => {
    render(<Harness disabled />);
    const sw = screen.getByRole("switch", { name: "Quiet hours" });
    expect(sw).toBeDisabled();
    await userEvent.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "false");
  });
});

describe("Tabs", () => {
  const TABS = [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta" },
    { value: "c", label: "Gamma" },
  ] as const;

  function TabHarness() {
    const [v, setV] = useState<"a" | "b" | "c">("a");
    return (
      <>
        <Tabs label="Greek" idPrefix="greek" layoutId="greek" value={v} onChange={setV} tabs={[...TABS]} />
        <div role="tabpanel" id={tabPanelId("greek")} aria-labelledby={`greek-tab-${v}`} tabIndex={0}>
          Panel {v}
        </div>
      </>
    );
  }

  it("implements the ARIA tabs pattern with arrow, Home and End keys", async () => {
    const user = userEvent.setup();
    const { container } = render(<TabHarness />);
    const list = screen.getByRole("tablist", { name: "Greek" });
    const tabs = within(list).getAllByRole("tab");
    expect(tabs.map((t) => t.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[0]).toHaveAttribute("aria-controls", "greek-panel");

    tabs[0].focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Beta" })).toHaveTextContent("Panel b");

    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Gamma" })).toHaveFocus();
    await user.keyboard("{ArrowRight}"); // wraps
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Gamma" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveAttribute("aria-selected", "true");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("renders a toggle-button group (aria-pressed) without idPrefix", async () => {
    const onChange = vi.fn();
    const { container } = render(<Tabs label="Range" layoutId="range" value="a" onChange={onChange} tabs={[...TABS]} />);
    expect(screen.getByRole("group", { name: "Range" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alpha" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Beta" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(screen.getByRole("button", { name: "Gamma" }));
    expect(onChange).toHaveBeenCalledWith("c");
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("Modal", () => {
  function ModalHarness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Open settings</button>
        <Modal open={open} onClose={() => setOpen(false)} title="Settings dialog">
          <input aria-label="Name" />
          <button>Save</button>
        </Modal>
      </>
    );
  }

  it("is a labelled modal dialog that traps focus, closes on Escape and restores focus", async () => {
    const user = userEvent.setup();
    const { container } = render(<ModalHarness />);
    const opener = screen.getByRole("button", { name: "Open settings" });
    await user.click(opener);

    const dialog = screen.getByRole("dialog", { name: "Settings dialog" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const close = within(dialog).getByRole("button", { name: "Close dialog" });
    expect(close).toHaveFocus(); // first focusable element

    await user.tab();
    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole("button", { name: "Save" })).toHaveFocus();
    await user.tab(); // wraps to the start
    expect(close).toHaveFocus();
    await user.tab({ shift: true }); // and backwards to the end
    expect(within(dialog).getByRole("button", { name: "Save" })).toHaveFocus();

    expect(await axe(container)).toHaveNoViolations();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("closes from the close button", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);
    await user.click(screen.getByRole("button", { name: "Open settings" }));
    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("Field", () => {
  it("labels a single control and links its hint", async () => {
    const { container } = render(
      <Field label="Evidence note" hint="Avoid personal details.">
        <input />
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: "Evidence note" });
    expect(input).toHaveAccessibleDescription("Avoid personal details.");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("renders a labelled group for composite children", async () => {
    const { container } = render(
      <Field group label="Community type">
        <button>School</button>
        <button>Apartment</button>
      </Field>,
    );
    expect(screen.getByRole("group", { name: "Community type" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "School" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("states and layout primitives", () => {
  it("announces loading regions once and hides decorative skeletons", () => {
    render(
      <>
        <LoadingRegion label="Loading alerts…">
          <Skeleton className="h-4" />
          <Skeleton className="h-4" />
        </LoadingRegion>
        <Skeleton label="Loading history…" />
      </>,
    );
    const statuses = screen.getAllByRole("status");
    expect(statuses).toHaveLength(2);
    expect(statuses[0]).toHaveTextContent("Loading alerts…");
    expect(statuses[0]).toHaveAttribute("aria-busy", "true");
    expect(statuses[1]).toHaveTextContent("Loading history…");
  });

  it("announces errors and renders empty states", () => {
    render(
      <>
        <ErrorState title="History unavailable" message="Timed out" />
        <EmptyState title="No alerts so far" description="All quiet." />
      </>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("History unavailable");
    expect(screen.getByText("No alerts so far")).toBeInTheDocument();
  });

  it("keeps a valid heading outline: page h1, card h2", async () => {
    const { container } = render(
      <main>
        <PageHeader
          eyebrow="Alerts"
          title="Alert centre"
          description="Background risk detection."
          actions={
            <Badge dot color="#35D399">
              Live
            </Badge>
          }
        />
        <Card>
          <CardHeader icon={<svg aria-hidden="true" />} title="Delivery rules" subtitle="Quiet hours apply" />
        </Card>
      </main>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Alert centre" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Delivery rules" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
