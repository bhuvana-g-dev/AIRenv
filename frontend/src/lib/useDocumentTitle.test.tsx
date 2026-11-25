import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HOME_TITLE, titleForPath, useDocumentTitle } from "./useDocumentTitle";

describe("titleForPath", () => {
  it("names every route", () => {
    expect(titleForPath("/")).toBe(HOME_TITLE);
    expect(titleForPath("/app")).toBe("Intelligence dashboard · AIRenv");
    expect(titleForPath("/app/")).toBe("Intelligence dashboard · AIRenv");
    expect(titleForPath("/app/map")).toBe("Air map · AIRenv");
    expect(titleForPath("/app/assistant")).toBe("AIRenv AI assistant · AIRenv");
    expect(titleForPath("/app/community")).toBe("Community · AIRenv");
    expect(titleForPath("/app/impact")).toBe("Impact · AIRenv");
    expect(titleForPath("/app/alerts")).toBe("Alerts · AIRenv");
    expect(titleForPath("/app/settings")).toBe("Settings · AIRenv");
    expect(titleForPath("/nope")).toBe("Page not found · AIRenv");
  });
});

function Titled({ title }: { title: string }) {
  useDocumentTitle(title);
  return null;
}

describe("useDocumentTitle", () => {
  it("sets and updates document.title", () => {
    const { rerender } = render(<Titled title="First" />);
    expect(document.title).toBe("First");
    rerender(<Titled title="Second" />);
    expect(document.title).toBe("Second");
  });
});
