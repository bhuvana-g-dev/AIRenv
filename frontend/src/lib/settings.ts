import type { Profile } from "./types";

/** PATCH body containing only the given profile fields, taken from the edited draft. */
export function profilePatch(draft: Profile, fields: (keyof Profile)[]): Partial<Profile> {
  return Object.fromEntries(fields.map((f) => [f, draft[f]]));
}

/** Clamp a number-input value into [min, max] (NaN falls to `min`). */
export function clampInt(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/** "in 9 min" style phrase for a link code's expiry, reusing the relative-time formatter. */
export function expiresIn(relative: string): string {
  return relative.replace("ago", "from now");
}

/** Offer `data` to the user as a pretty-printed JSON file download. */
export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
