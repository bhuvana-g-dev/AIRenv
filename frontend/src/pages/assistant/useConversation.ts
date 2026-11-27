import { useEffect, useState } from "react";
import { contextTurns, loadHistory, newMessage, saveHistory, type ChatMessage } from "../../lib/conversation";
import { useAssistant } from "../../lib/queries";
import { useApp } from "../../lib/store";

/**
 * Chat state for the assistant: the browser-persisted message list and a `send` that asks the
 * backend with the current location and recent turns, appending the answer or the error.
 */
export function useConversation() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory(localStorage));
  const location = useApp((s) => s.location);
  const demo = useApp((s) => s.demo);
  const ask = useAssistant();

  useEffect(() => saveHistory(localStorage, messages), [messages]);

  const append = (m: ChatMessage) => setMessages((all) => [...all, m]);

  /** Returns false when nothing was sent (empty question or a reply still pending). */
  const send = (q: string): boolean => {
    const question = q.trim();
    if (!question || ask.isPending) return false;
    const history = contextTurns(messages);
    append(newMessage("user", question));
    ask.mutate(
      { question, history, lat: location.lat, lon: location.lon, name: location.name, demo },
      {
        onSuccess: (reply) => append(newMessage("assistant", reply.answer, { reply })),
        onError: (e) => append(newMessage("assistant", e.message, { error: true })),
      },
    );
    return true;
  };

  return { messages, send, clear: () => setMessages([]), pending: ask.isPending, demo };
}
