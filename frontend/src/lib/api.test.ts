import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getIdToken } from "./auth";
import { api, ApiError, del, locQuery, parseErrorDetail, patch, post } from "./api";

vi.mock("./auth", () => ({ getIdToken: vi.fn() }));

type FakeResponse = { ok: boolean; status: number; json: () => Promise<unknown> };
const respond = (status: number, body?: unknown, jsonFails = false): FakeResponse => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => (jsonFails ? Promise.reject(new SyntaxError("Unexpected token")) : Promise.resolve(body)),
});

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.mocked(getIdToken).mockResolvedValue(null);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const lastHeaders = () => fetchMock.mock.calls[0][1].headers as Headers;

describe("api()", () => {
  it("returns parsed JSON on success and calls the path", async () => {
    fetchMock.mockResolvedValue(respond(200, { hello: "world" }));
    await expect(api<{ hello: string }>("/api/ping")).resolves.toEqual({ hello: "world" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/ping");
  });

  it("adds a bearer token when the user is signed in", async () => {
    vi.mocked(getIdToken).mockResolvedValue("tok-123");
    fetchMock.mockResolvedValue(respond(200, {}));
    await api("/api/me");
    expect(lastHeaders().get("Authorization")).toBe("Bearer tok-123");
  });

  it("omits Authorization without a token", async () => {
    fetchMock.mockResolvedValue(respond(200, {}));
    await api("/api/me");
    expect(lastHeaders().has("Authorization")).toBe(false);
  });

  it("sets a JSON content type only when there is a body and none was given", async () => {
    fetchMock.mockResolvedValue(respond(200, {}));
    await api("/a", { method: "POST", body: "{}" });
    expect(lastHeaders().get("Content-Type")).toBe("application/json");

    fetchMock.mockClear();
    await api("/a", { method: "POST", body: "x", headers: { "Content-Type": "text/plain" } });
    expect(lastHeaders().get("Content-Type")).toBe("text/plain");

    fetchMock.mockClear();
    await api("/a");
    expect(lastHeaders().has("Content-Type")).toBe(false);
  });

  it("uses a string `detail` as the error message", async () => {
    fetchMock.mockResolvedValue(respond(404, { detail: "Not here" }));
    const err = await api("/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 404, message: "Not here" });
  });

  it("reads message, code and demo flag from an object `detail`", async () => {
    fetchMock.mockResolvedValue(respond(503, { detail: { message: "Providers down", code: "data_unavailable", demo_available: true } }));
    await expect(api("/x")).rejects.toMatchObject({
      status: 503,
      message: "Providers down",
      code: "data_unavailable",
      demoAvailable: true,
    });
  });

  it("keeps the generic message when an object `detail` has no message", async () => {
    fetchMock.mockResolvedValue(respond(500, { detail: { code: "boom" } }));
    await expect(api("/x")).rejects.toMatchObject({ message: "Request failed (500)", code: "boom" });
  });

  it("joins FastAPI validation errors", async () => {
    fetchMock.mockResolvedValue(respond(422, { detail: [{ msg: "field required" }, { msg: "value too large" }] }));
    await expect(api("/x")).rejects.toMatchObject({ status: 422, message: "field required; value too large" });
  });

  it("falls back to the status when the error body is not JSON", async () => {
    fetchMock.mockResolvedValue(respond(502, undefined, true));
    await expect(api("/x")).rejects.toMatchObject({ status: 502, message: "Request failed (502)" });
  });

  it("maps network failures to ApiError(0)", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const err = (await api("/x").catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.message).toMatch(/cannot reach the airenv service/i);
  });

  it("aborts slow requests with a timeout message", async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );
    await expect(api("/slow", { timeoutMs: 5 })).rejects.toMatchObject({ status: 0, message: expect.stringMatching(/timed out/i) });
  });

  it("passes a caller-provided abort signal through", async () => {
    fetchMock.mockResolvedValue(respond(200, {}));
    const ctrl = new AbortController();
    await api("/x", { signal: ctrl.signal });
    expect(fetchMock.mock.calls[0][1].signal).toBe(ctrl.signal);
  });
});

describe("method helpers", () => {
  it("post/patch/del send the right method and JSON body", async () => {
    fetchMock.mockResolvedValue(respond(200, { ok: true }));
    await post("/p", { a: 1 });
    await post("/p2");
    await patch("/q", { b: 2 });
    await del("/r");
    const calls = fetchMock.mock.calls.map(([url, init]) => [url, init.method, init.body]);
    expect(calls).toEqual([
      ["/p", "POST", '{"a":1}'],
      ["/p2", "POST", undefined],
      ["/q", "PATCH", '{"b":2}'],
      ["/r", "DELETE", undefined],
    ]);
  });
});

describe("parseErrorDetail()", () => {
  it("reads string, object and validation-list details", () => {
    expect(parseErrorDetail({ detail: "Nope" }, "fallback")).toEqual({ message: "Nope" });
    expect(parseErrorDetail({ detail: { message: "Down", code: "x", demo_available: true } }, "f")).toEqual({
      message: "Down",
      code: "x",
      demoAvailable: true,
    });
    expect(parseErrorDetail({ detail: [{ msg: "a" }, { msg: "b" }] }, "f")).toEqual({ message: "a; b" });
  });

  it("falls back for empty or unexpected bodies", () => {
    expect(parseErrorDetail(null, "Request failed (500)")).toEqual({ message: "Request failed (500)" });
    expect(parseErrorDetail({ detail: {} }, "fb")).toMatchObject({ message: "fb" });
    expect(parseErrorDetail("oops", "fb")).toEqual({ message: "fb" });
  });
});

describe("locQuery()", () => {
  it("serialises a location and the demo flag", () => {
    expect(locQuery({ lat: 28.61, lon: 77.2, name: "New Delhi" })).toBe("lat=28.61&lon=77.2&name=New+Delhi");
    expect(locQuery({ lat: 1, lon: 2, name: "A&B" }, true)).toBe("lat=1&lon=2&name=A%26B&demo=true");
  });

  it("handles a missing location", () => {
    expect(locQuery(null)).toBe("");
    expect(locQuery(null, true)).toBe("demo=true");
  });
});
