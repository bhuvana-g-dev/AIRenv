import { AnimatePresence, useReducedMotion } from "motion/react";
import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DemoBanner } from "../../components/env";
import { Button, PageHeader } from "../../components/ui";
import { useBundle } from "../../lib/queries";
import type { Snapshot } from "../../lib/types";
import { Composer } from "./Composer";
import { EmptyConversation, TypingIndicator } from "./EmptyConversation";
import { MessageBubble } from "./MessageBubble";
import { useConversation } from "./useConversation";

function ContextLine({ snap }: { snap: Snapshot | undefined }) {
  if (!snap) return <>Loading environmental context…</>;
  return (
    <>
      Answers use live context for <b className="text-ink">{snap.location.name}</b>: NAQI {snap.aqi.value} ({snap.aqi.category?.label}),
      PM2.5 {snap.pollutants.pm2_5.value} µg/m³, observed {snap.observed_local?.slice(11, 16)}.
    </>
  );
}

export default function AssistantPage() {
  const { messages, send, clear, pending, demo } = useConversation();
  const [input, setInput] = useState("");
  const bundle = useBundle();
  const endRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "end" });
  }, [messages, pending, reduce]);

  const ask = (q: string) => {
    if (send(q)) setInput("");
  };

  return (
    <div className="flex h-[calc(100vh-7.5rem)] flex-col">
      {demo && <DemoBanner />}
      <PageHeader
        eyebrow="AIRenv AI"
        title={<span className="text-gradient-ai">Environmental assistant</span>}
        description={<ContextLine snap={bundle.data?.snapshot} />}
        actions={
          messages.length > 0 && (
            <Button variant="ghost" size="sm" icon={<Trash2 aria-hidden="true" className="h-3.5 w-3.5" />} onClick={clear}>
              Clear history
            </Button>
          )
        }
      />

      <div className="glass flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl">
        <div
          role="log"
          aria-label="Conversation with AIRenv AI"
          aria-live="polite"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the scrollable conversation log must be keyboard-scrollable (WCAG 2.1.1)
          tabIndex={0}
          className="flex-1 space-y-5 overflow-y-auto p-4 md:p-6"
        >
          {messages.length === 0 && <EmptyConversation onAsk={ask} />}
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <MessageBubble key={m.id} m={m} onAsk={ask} />
            ))}
          </AnimatePresence>
          {pending && <TypingIndicator />}
          <div ref={endRef} />
        </div>
        <Composer value={input} onChange={setInput} onSend={() => ask(input)} pending={pending} />
      </div>
    </div>
  );
}
