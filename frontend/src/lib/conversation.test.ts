import { describe, expect, it } from "vitest";
import { CONTEXT_TURNS, HISTORY_STORAGE_KEY, STORED_MESSAGES, contextTurns, loadHistory, newMessage, saveHistory } from "./conversation";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe("conversation history", () => {
  it("loads an empty conversation when nothing or invalid data is stored", () => {
    expect(loadHistory(memoryStorage())).toEqual([]);
    expect(loadHistory(memoryStorage({ [HISTORY_STORAGE_KEY]: "{not json" }))).toEqual([]);
    expect(loadHistory(memoryStorage({ [HISTORY_STORAGE_KEY]: '{"a":1}' }))).toEqual([]);
  });

  it("round-trips and keeps only the most recent messages", () => {
    const storage = memoryStorage();
    const messages = Array.from({ length: STORED_MESSAGES + 5 }, (_, i) => newMessage("user", `q${i}`));
    saveHistory(storage, messages);
    const loaded = loadHistory(storage);
    expect(loaded).toHaveLength(STORED_MESSAGES);
    expect(loaded[0].content).toBe("q5");
  });

  it("sends only role and content of the last few turns as context", () => {
    const messages = Array.from({ length: 10 }, (_, i) => newMessage(i % 2 ? "assistant" : "user", `m${i}`, { error: true }));
    const ctx = contextTurns(messages);
    expect(ctx).toHaveLength(CONTEXT_TURNS);
    expect(ctx[0]).toEqual({ role: "user", content: "m2" });
  });

  it("creates messages with an id and timestamp", () => {
    const m = newMessage("assistant", "hi", { error: true });
    expect(m).toMatchObject({ role: "assistant", content: "hi", error: true });
    expect(m.id).toBeTruthy();
    expect(Number.isNaN(Date.parse(m.at))).toBe(false);
  });
});
