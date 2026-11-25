// vitest-axe 0.1 augments the legacy `Vi` namespace; register its matcher on Vitest 2's types.
// (Declaration merging requires the same type-parameter name as Vitest's own declaration.)
/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-object-type, @typescript-eslint/no-explicit-any */
import "vitest";
import type { AxeMatchers } from "vitest-axe/matchers";

declare module "vitest" {
  interface Assertion<T = any> extends AxeMatchers {}
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
