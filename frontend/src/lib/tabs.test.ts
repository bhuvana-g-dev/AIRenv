import { describe, expect, it } from "vitest";
import { nextTabIndex, tabId, tabPanelId } from "./tabs";

describe("tab ids", () => {
  it("derives stable tab and panel ids from the prefix", () => {
    expect(tabId("impact", "exposure")).toBe("impact-tab-exposure");
    expect(tabPanelId("impact")).toBe("impact-panel");
  });
});

describe("nextTabIndex", () => {
  it("moves with the arrow keys and wraps at both ends", () => {
    expect(nextTabIndex("ArrowRight", 0, 3)).toBe(1);
    expect(nextTabIndex("ArrowDown", 2, 3)).toBe(0);
    expect(nextTabIndex("ArrowLeft", 0, 3)).toBe(2);
    expect(nextTabIndex("ArrowUp", 1, 3)).toBe(0);
  });

  it("jumps to the first and last tab with Home and End", () => {
    expect(nextTabIndex("Home", 2, 4)).toBe(0);
    expect(nextTabIndex("End", 0, 4)).toBe(3);
  });

  it("ignores other keys and empty tab lists", () => {
    expect(nextTabIndex("Enter", 0, 3)).toBeNull();
    expect(nextTabIndex("constructor", 0, 3)).toBeNull();
    expect(nextTabIndex("ArrowRight", 0, 0)).toBeNull();
  });
});
