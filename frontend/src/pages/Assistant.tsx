import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Bot, Info, Send, Sparkles, Trash2, User } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { DemoBanner, RecommendationCard } from "../components/env";
import { Badge, Button, PageHeader } from "../components/ui";
import { useAssistant, useBundle } from "../lib/queries";
import { useApp } from "../lib/store";
import type { AssistantReply } from "../lib/types";

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  reply?: AssistantReply;
  error?: boolean;
  at: string;
}

const SUGGESTED = [
  "Why is the air quality poor today?",
  "Is it safe to play outside?",
  "How can I improve indoor air quality?",
  "What can my apartment do to reduce emissions?",
  "What is the best time for outdoor activities?",
  "How can we organize a low-emission event?",
];
const STORAGE_KEY = "airenv-assistant-history";

/** Minimal, safe markdown: **bold**, line breaks and paragraphs. No HTML injection. */
function Markdownish({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/);
  return (
    <>
      {paragraphs.map((p, i) => (
        <p key={i} className="mb-2 last:mb-0">
          {p.split("\n").map((line, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              {line.split(/(\*\*[^*]+\*\*)/g).map((seg, k): ReactNode =>
                seg.startsWith("**") && seg.endsWith("**") ? (
                  <strong key={k} className="font-semibold text-ink">
                    {seg.slice(2, -2)}
                  </strong>
                ) : (
                  <Fragment key={k}>{seg.replace(/^[-*] /, "• ")}</Fragment>
                ),
              )}
            </Fragment>
          ))}
        </p>
      ))}
    </>
  );
}

function Typing() {
  return (
    <div role="status" className="flex items-center gap-1.5 px-1 py-2">
      {[0, 1, 2].map((i) => (
        <motion.span key={i} aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-cyan" animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }} />
      ))}
      <span className="ml-2 text-xs text-muted">Reading current conditions…</span>
    </div>
  );
}

export default function Assistant() {
  const [messages, setMessages] = useState<Msg[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as Msg[];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const location = useApp((s) => s.location);
  const demo = useApp((s) => s.demo);
  const bundle = useBundle();
  const ask = useAssistant();
  const endRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)));
    endRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "end" });
  }, [messages, ask.isPending, reduce]);

  const send = (q: string) => {
    const question = q.trim();
    if (!question || ask.isPending) return;
    const userMsg: Msg = { id: crypto.randomUUID(), role: "user", content: question, at: new Date().toISOString() };
    const history = messages.slice(-8).map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, userMsg]);
    setInput("");
    ask.mutate(
      { question, history, lat: location.lat, lon: location.lon, name: location.name, demo },
      {
        onSuccess: (reply) => setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", content: reply.answer, reply, at: new Date().toISOString() }]),
        onError: (e) =>
          setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", content: (e as Error).message, error: true, at: new Date().toISOString() }]),
      },
    );
  };

  const snap = bundle.data?.snapshot;

  return (
    <div className="flex h-[calc(100vh-7.5rem)] flex-col">
      {demo && <DemoBanner />}
      <PageHeader
        eyebrow="AIRenv AI"
        title={<span className="text-gradient-ai">Environmental assistant</span>}
        description={
          snap ? (
            <>
              Answers use live context for <b className="text-ink">{snap.location.name}</b>: NAQI {snap.aqi.value} ({snap.aqi.category?.label}), PM2.5 {snap.pollutants.pm2_5.value} µg/m³, observed {snap.observed_local?.slice(11, 16)}.
            </>
          ) : (
            "Loading environmental context…"
          )
        }
        actions={
          messages.length > 0 && (
            <Button variant="ghost" size="sm" icon={<Trash2 aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => setMessages([])}>
              Clear history
            </Button>
          )
        }
      />

      <div className="glass flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl">
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the scrollable conversation log must be keyboard-scrollable (WCAG 2.1.1) */}
        <div role="log" aria-label="Conversation with AIRenv AI" aria-live="polite" tabIndex={0} className="flex-1 space-y-5 overflow-y-auto p-4 md:p-6">
          {messages.length === 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-2xl py-8 text-center">
              <div className="relative mx-auto mb-5 grid h-16 w-16 place-items-center">
                <motion.div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan/40 to-violet/40 blur-xl" animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0.9, 0.6] }} transition={{ duration: 3, repeat: Infinity }} />
                <div className="relative grid h-16 w-16 place-items-center rounded-2xl border border-cyan/30 bg-bg-2">
                  <Sparkles aria-hidden="true" className="h-7 w-7 text-cyan" />
                </div>
              </div>
              <h2 className="font-display text-xl font-semibold">Ask about the air around you</h2>
              <p className="mt-2 text-sm text-muted">AIRenv AI reads the current readings, forecast and your household or community context. It never invents numbers and says when data is uncertain.</p>
              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                {SUGGESTED.map((s, i) => (
                  <motion.button
                    key={s}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + i * 0.05 }}
                    whileHover={{ y: -2 }}
                    onClick={() => send(s)}
                    className="rounded-xl border hairline bg-black/20 px-4 py-3 text-left text-sm text-ink/90 hover:border-cyan/30 hover:bg-cyan/5"
                  >
                    {s}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div key={m.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={m.role === "user" ? "flex max-w-[85%] flex-row-reverse gap-3" : "flex max-w-[92%] gap-3 md:max-w-[80%]"}>
                  <span aria-hidden="true" className={m.role === "user" ? "grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-emerald/15 text-mint" : "grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-cyan/25 to-violet/25 text-cyan"}>
                    {m.role === "user" ? <User aria-hidden="true" className="h-4 w-4" /> : <Bot aria-hidden="true" className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0">
                    <div className={m.role === "user" ? "rounded-2xl rounded-tr-sm bg-emerald/15 px-4 py-2.5 text-sm" : m.error ? "rounded-2xl rounded-tl-sm border border-orange-400/30 bg-orange-400/10 px-4 py-3 text-sm text-orange-100" : "rounded-2xl rounded-tl-sm border hairline bg-black/25 px-4 py-3 text-sm leading-relaxed text-ink/90"}>
                      <span className="sr-only">{m.role === "user" ? "You said:" : m.error ? "AIRenv AI error:" : "AIRenv AI replied:"}</span>
                      <Markdownish text={m.content} />
                    </div>
                    {m.reply && (
                      <div className="mt-2 space-y-2">
                        {m.reply.cards.map((c, i) => (
                          <RecommendationCard key={c.id} rec={c} index={i} />
                        ))}
                        <div className="flex flex-wrap gap-1.5">
                          {m.reply.data_refs.map((d) => (
                            <span key={d.label} className="rounded-md border hairline bg-white/[0.02] px-2 py-1 font-mono text-[10px] text-muted" title={`${d.source} · ${d.observed_at}`}>
                              {d.label}: <span className="text-ink">{d.value ?? "—"}</span> {d.unit}
                            </span>
                          ))}
                        </div>
                        <p className="flex items-start gap-1.5 text-[11px] text-faint">
                          <Info aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
                          {m.reply.uncertainty}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge color={m.reply.generated_by === "gemini" ? "#A78BFA" : "#94A89D"}>{m.reply.generated_by === "gemini" ? "Gemini · grounded" : "Rule-based answer"}</Badge>
                          {m.reply.is_demo && <Badge color="#A78BFA">sample data</Badge>}
                          {m.reply.follow_ups.map((f) => (
                            <button key={f} onClick={() => send(f)} className="rounded-full border hairline px-2.5 py-0.5 text-[11px] text-muted hover:border-cyan/30 hover:text-ink">
                              {f}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {ask.isPending && <Typing />}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="border-t hairline bg-bg-2/60 p-3 md:p-4"
        >
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              maxLength={600}
              placeholder="Ask about today's air, timing, indoor air, or community actions…"
              className="input max-h-32 min-h-[44px] resize-none"
              aria-label="Message AIRenv AI"
            />
            <Button type="submit" variant="ai" className="h-11 w-11 shrink-0 !px-0" disabled={!input.trim()} loading={ask.isPending} aria-label="Send message">
              {!ask.isPending && <Send aria-hidden="true" className="h-4 w-4" />}
            </Button>
          </div>
          <p className="mt-2 text-[10px] text-faint">Conversation history is stored only in this browser. AIRenv AI gives general guidance, not medical advice.</p>
        </form>
      </div>
    </div>
  );
}
