import { afterEach, describe, expect, it, vi } from "vitest";
import { clampInt, downloadJson, expiresIn, profilePatch } from "./settings";
import type { Profile } from "./types";

describe("profilePatch", () => {
  it("copies only the requested fields from the draft", () => {
    const draft = { display_name: "Asha", language: "hi", onboarded: true } as Profile;
    expect(profilePatch(draft, ["display_name", "language"])).toEqual({ display_name: "Asha", language: "hi" });
  });
});

describe("clampInt", () => {
  it("keeps values inside the range", () => {
    expect(clampInt(0, 1, 20)).toBe(1);
    expect(clampInt(50, 1, 20)).toBe(20);
    expect(clampInt(7, 1, 20)).toBe(7);
    expect(clampInt(Number.NaN, 1, 20)).toBe(1);
  });
});

describe("expiresIn", () => {
  it("turns a past-tense relative time into a future one", () => {
    expect(expiresIn("9 min ago")).toBe("9 min from now");
  });
});

describe("downloadJson", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("clicks a temporary link to a JSON blob and revokes it", () => {
    const createObjectURL = vi.fn(() => "blob:mock");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    downloadJson({ a: 1 }, "data.json");

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });
});
