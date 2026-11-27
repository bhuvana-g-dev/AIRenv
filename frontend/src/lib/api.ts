import { getIdToken } from "./auth";

export const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

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
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON error */
    }
    const { message, code, demoAvailable } = parseErrorDetail(body, `Request failed (${res.status})`);
    throw new ApiError(res.status, message, code, demoAvailable);
  }
  return res.json() as Promise<T>;
}

/** FastAPI `detail` payloads: a plain string, `{message, code, demo_available}`, or a validation-error list. */
type ErrorDetail = string | { message?: string; code?: string; demo_available?: boolean } | { msg: string }[];

/** Extract a user-facing message (and optional machine code) from an error response body. */
export function parseErrorDetail(body: unknown, fallback: string): { message: string; code?: string; demoAvailable?: boolean } {
  const d = body && typeof body === "object" && "detail" in body ? (body.detail as ErrorDetail | null) : null;
  if (typeof d === "string") return { message: d };
  if (Array.isArray(d)) return { message: d.map((x) => x.msg).join("; ") };
  if (d && typeof d === "object") return { message: d.message ?? fallback, code: d.code, demoAvailable: d.demo_available };
  return { message: fallback };
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
