import { getIdToken } from "./auth";

export const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export class ApiError extends Error {
  status: number;
  code?: string;
  demoAvailable?: boolean;
  constructor(status: number, message: string, code?: string, demoAvailable?: boolean) {
    super(message);
    this.status = status;
    this.code = code;
    this.demoAvailable = demoAvailable;
  }
}

export async function api<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 20000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = new Headers(rest.headers);
  if (rest.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const token = await getIdToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...rest, headers, signal: rest.signal ?? controller.signal });
  } catch (e) {
    clearTimeout(timer);
    if ((e as Error).name === "AbortError") throw new ApiError(0, "The request timed out. Check your connection.");
    throw new ApiError(0, "Cannot reach the AIRenv service. You may be offline or the backend is not running.");
  }
  clearTimeout(timer);
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let code: string | undefined;
    let demo: boolean | undefined;
    try {
      const body = await res.json();
      const d = body.detail;
      if (typeof d === "string") message = d;
      else if (d && typeof d === "object") {
        message = d.message ?? message;
        code = d.code;
        demo = d.demo_available;
      }
      if (Array.isArray(d)) message = d.map((x: { msg: string }) => x.msg).join("; ");
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(res.status, message, code, demo);
  }
  return res.json() as Promise<T>;
}

export function locQuery(loc: { lat: number; lon: number; name: string } | null, demo = false): string {
  const p = new URLSearchParams();
  if (loc) {
    p.set("lat", String(loc.lat));
    p.set("lon", String(loc.lon));
    p.set("name", loc.name);
  }
  if (demo) p.set("demo", "true");
  return p.toString();
}

export const post = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
export const del = <T>(path: string) => api<T>(path, { method: "DELETE" });
