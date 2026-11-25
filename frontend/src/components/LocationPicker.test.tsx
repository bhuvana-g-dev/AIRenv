import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import type { Location } from "../lib/types";
import { axe } from "../test/utils";
import { LocationModal } from "./LocationPicker";
import { currentPosition } from "../lib/locationSearch";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

const PUNE: Location = { id: "18.52_73.86", name: "Pune", lat: 18.52, lon: 73.86, admin1: "Maharashtra", country: "India" };

function Harness({ onSelect }: { onSelect: (l: Location) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Change location</button>
      <LocationModal open={open} onClose={() => setOpen(false)} onSelect={onSelect} />
    </>
  );
}

describe("LocationModal", () => {
  beforeEach(() => {
    vi.mocked(api).mockResolvedValue({ results: [PUNE] });
  });

  it("opens as a labelled dialog with focus in the search box", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness onSelect={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Change location" }));
    const dialog = screen.getByRole("dialog", { name: "Choose location" });
    expect(within(dialog).getByRole("searchbox", { name: "Search location" })).toHaveFocus();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("searches, announces the result count and selects a place", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    const opener = screen.getByRole("button", { name: "Change location" });
    await user.click(opener);
    await user.type(screen.getByRole("searchbox", { name: "Search location" }), "Pune");

    const option = await screen.findByRole("button", { name: /Pune.*Maharashtra, India/ });
    expect(api).toHaveBeenCalledWith("/api/locations/search?q=Pune", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(screen.getByText("1 place found.")).toBeInTheDocument();

    await user.click(option);
    expect(onSelect).toHaveBeenCalledWith(PUNE);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("announces when nothing matches", async () => {
    vi.mocked(api).mockResolvedValue({ results: [] });
    const user = userEvent.setup();
    render(<Harness onSelect={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Change location" }));
    await user.type(screen.getByRole("searchbox"), "zzz");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/no places found/i));
  });

  it("shows search errors as an alert", async () => {
    vi.mocked(api).mockRejectedValue(new Error("Search service unavailable"));
    const user = userEvent.setup();
    render(<Harness onSelect={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Change location" }));
    await user.type(screen.getByRole("searchbox"), "Delhi");
    expect(await screen.findByRole("alert")).toHaveTextContent("Search service unavailable");
  });

  it("closes on Escape and returns focus to the opener", async () => {
    const user = userEvent.setup();
    render(<Harness onSelect={vi.fn()} />);
    const opener = screen.getByRole("button", { name: "Change location" });
    await user.click(opener);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});

describe("currentPosition", () => {
  it("rejects with a clear message when geolocation is unsupported", async () => {
    const original = navigator.geolocation;
    Object.defineProperty(navigator, "geolocation", { value: undefined, configurable: true });
    await expect(currentPosition()).rejects.toThrow("Geolocation is not supported by this browser.");
    Object.defineProperty(navigator, "geolocation", { value: original, configurable: true });
  });

  it("reverse-geocodes, falling back to raw coordinates", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: (ok: PositionCallback) => ok({ coords: { latitude: 12.97, longitude: 77.59 } } as GeolocationPosition) },
    });
    vi.mocked(api).mockRejectedValueOnce(new Error("offline"));
    await expect(currentPosition()).resolves.toEqual({ id: "12.97_77.59", name: "My location", lat: 12.97, lon: 77.59 });
  });
});
