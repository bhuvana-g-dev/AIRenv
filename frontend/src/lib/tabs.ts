/** DOM id of a tab button rendered by `<Tabs idPrefix=…>`. */
export const tabId = (prefix: string, value: string) => `${prefix}-tab-${value}`;

/** DOM id of the panel controlled by `<Tabs idPrefix=…>`. */
export const tabPanelId = (prefix: string) => `${prefix}-panel`;

const KEY_STEPS = new Map<string, (current: number, count: number) => number>([
  ["ArrowRight", (i) => i + 1],
  ["ArrowDown", (i) => i + 1],
  ["ArrowLeft", (i) => i - 1],
  ["ArrowUp", (i) => i - 1],
  ["Home", () => 0],
  ["End", (_, count) => count - 1],
]);

/**
 * Index of the tab a key press moves to in an ARIA tablist (arrows wrap around, Home / End
 * jump to the ends), or `null` when the key is not a tablist navigation key.
 */
export function nextTabIndex(key: string, current: number, count: number): number | null {
  const step = KEY_STEPS.get(key);
  if (!step || count === 0) return null;
  return (step(current, count) + count) % count;
}
