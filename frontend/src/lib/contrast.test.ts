/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CATEGORY_TEXT_COLORS, SEVERITY_COLORS } from "./aqi";
import { contrastRatio, readableTextOn, relativeLuminance } from "./contrast";

// Read the real stylesheet so the test fails if someone lowers a token's contrast.
// Vitest runs from the frontend root; under jsdom `import.meta.url` is not a file: URL.
const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

const token = (name: string) => {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token ${name} not found`);
  return m[1];
};

// Darkest and lightest backgrounds text is placed on: page, card surface, modal glass (≈ rgb(22,50,38)).
const BACKGROUNDS = { bg: token("bg"), surface2: token("surface-2"), modal: "#163226" };

describe("contrast helpers", () => {
  it("computes WCAG luminance and ratios", () => {
    expect(relativeLuminance("#000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBe(1);
    expect(contrastRatio("#000", "#fff")).toBe(contrastRatio("#fff", "#000"));
    expect(() => relativeLuminance("blue")).toThrow(/invalid/i);
  });

  it("picks the more readable text colour for a fill", () => {
    expect(readableTextOn("#35D399")).toBe("#000000");
    expect(readableTextOn("#07110E")).toBe("#ffffff");
    expect(readableTextOn("#C0264F")).toBe("#ffffff");
  });
});

describe("theme tokens meet WCAG AA for normal text", () => {
  for (const name of ["ink", "muted", "faint"]) {
    for (const [bgName, bg] of Object.entries(BACKGROUNDS)) {
      it(`--color-${name} on ${bgName} ≥ 4.5:1`, () => {
        expect(contrastRatio(token(name), bg)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it("AQI category and severity text colours are readable on the page background", () => {
    for (const c of [...Object.values(CATEGORY_TEXT_COLORS), ...Object.values(SEVERITY_COLORS)]) {
      expect(contrastRatio(c, BACKGROUNDS.bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("the focus outline colour stands out against the page (≥ 3:1, WCAG 1.4.11)", () => {
    expect(contrastRatio(token("cyan"), BACKGROUNDS.bg)).toBeGreaterThanOrEqual(3);
    expect(css).toMatch(/:focus-visible\s*{[^}]*outline:\s*3px solid var\(--color-cyan\)/);
  });

  it("disables decorative animation for users who prefer reduced motion", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });
});
