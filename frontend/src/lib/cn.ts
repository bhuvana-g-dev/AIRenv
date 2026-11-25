import clsx from "clsx";

/** Join conditional class names. */
export function cn(...args: Parameters<typeof clsx>) {
  return clsx(...args);
}
