import { describe, expect, it } from "vitest";
import { notificationTone, reconnectDelay } from "./live";

describe("reconnectDelay", () => {
  it("doubles from 2 s and caps at 30 s", () => {
    expect([0, 1, 2, 3, 4, 10].map(reconnectDelay)).toEqual([2000, 4000, 8000, 16000, 30000, 30000]);
  });
});

describe("notificationTone", () => {
  it("maps severity and category to a toast tone", () => {
    expect(notificationTone({ severity: "critical", category: "positive" })).toBe("danger");
    expect(notificationTone({ severity: "high", category: "forecast" })).toBe("danger");
    expect(notificationTone({ severity: "low", category: "positive" })).toBe("success");
    expect(notificationTone({ severity: "medium", category: "forecast" })).toBe("warning");
  });
});
