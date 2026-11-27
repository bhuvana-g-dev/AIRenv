import { describe, expect, it } from "vitest";
import { parseMarkdownish } from "./markdownish";

describe("parseMarkdownish", () => {
  it("splits paragraphs and lines", () => {
    const doc = parseMarkdownish("one\ntwo\n\nthree");
    expect(doc).toHaveLength(2);
    expect(doc[0].map((line) => line.map((s) => s.text).join(""))).toEqual(["one", "two"]);
    expect(doc[1][0][0].text).toBe("three");
  });

  it("marks **bold** segments", () => {
    const [[line]] = parseMarkdownish("PM2.5 is **high** today");
    expect(line).toEqual([
      { text: "PM2.5 is ", bold: false },
      { text: "high", bold: true },
      { text: " today", bold: false },
    ]);
  });

  it("turns leading dashes and asterisks into bullets", () => {
    const [lines] = parseMarkdownish("- wear a mask\n* stay indoors");
    expect(lines.map((l) => l[0].text)).toEqual(["• wear a mask", "• stay indoors"]);
  });

  it("keeps HTML as literal text", () => {
    const [[line]] = parseMarkdownish("<img src=x onerror=alert(1)>");
    expect(line).toEqual([{ text: "<img src=x onerror=alert(1)>", bold: false }]);
  });
});
