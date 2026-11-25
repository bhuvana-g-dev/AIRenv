import { useEffect } from "react";

export const APP_NAME = "AIRenv";
export const HOME_TITLE = "AIRenv · The Intelligence Behind Every Breath";

const ROUTE_TITLES: Record<string, string> = {
  "/app": "Intelligence dashboard",
  "/app/map": "Air map",
  "/app/assistant": "AIRenv AI assistant",
  "/app/community": "Community",
  "/app/impact": "Impact",
  "/app/alerts": "Alerts",
  "/app/settings": "Settings",
};

/** Document title for a route path (WCAG 2.4.2 Page Titled). */
export function titleForPath(pathname: string): string {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (path === "/" || path === "/about") return HOME_TITLE;
  const page = ROUTE_TITLES[path];
  return `${page ?? "Page not found"} · ${APP_NAME}`;
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
