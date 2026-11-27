import type { AssistantReply } from "./types";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  reply?: AssistantReply;
  error?: boolean;
  at: string;
}

export const HISTORY_STORAGE_KEY = "airenv-assistant-history";
/** Messages kept in localStorage. */
export const STORED_MESSAGES = 40;
/** Previous turns sent to the backend as context with each question. */
export const CONTEXT_TURNS = 8;

/** Saved conversation, or an empty one when nothing (or something unreadable) is stored. */
export function loadHistory(storage: Pick<Storage, "getItem">): ChatMessage[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(HISTORY_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

export function saveHistory(storage: Pick<Storage, "setItem">, messages: ChatMessage[]): void {
  storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(messages.slice(-STORED_MESSAGES)));
}

/** The last few turns, stripped to what the backend needs. */
export function contextTurns(messages: ChatMessage[]): { role: string; content: string }[] {
  return messages.slice(-CONTEXT_TURNS).map((m) => ({ role: m.role, content: m.content }));
}

export function newMessage(role: ChatMessage["role"], content: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return { id: crypto.randomUUID(), role, content, at: new Date().toISOString(), ...extra };
}
