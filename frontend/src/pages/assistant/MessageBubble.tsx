import { motion } from "motion/react";
import { Bot, Info, User } from "lucide-react";
import { RecommendationCard } from "../../components/env";
import { Badge } from "../../components/ui";
import type { ChatMessage } from "../../lib/conversation";
import type { AssistantReply } from "../../lib/types";
import { Markdownish } from "./Markdownish";

const BUBBLE_STYLE = {
  user: "rounded-2xl rounded-tr-sm bg-emerald/15 px-4 py-2.5 text-sm",
  error: "rounded-2xl rounded-tl-sm border border-orange-400/30 bg-orange-400/10 px-4 py-3 text-sm text-orange-100",
  assistant: "rounded-2xl rounded-tl-sm border hairline bg-black/25 px-4 py-3 text-sm leading-relaxed text-ink/90",
};

const SPEAKER = { user: "You said:", error: "AIRenv AI error:", assistant: "AIRenv AI replied:" };

/** Recommendation cards, data references, uncertainty and follow-up questions under an answer. */
function ReplyDetails({ reply, onAsk }: { reply: AssistantReply; onAsk: (q: string) => void }) {
  return (
    <div className="mt-2 space-y-2">
      {reply.cards.map((c, i) => (
        <RecommendationCard key={c.id} rec={c} index={i} />
      ))}
      <div className="flex flex-wrap gap-1.5">
        {reply.data_refs.map((d) => (
          <span
            key={d.label}
            className="rounded-md border hairline bg-white/[0.02] px-2 py-1 font-mono text-[10px] text-muted"
            title={`${d.source} · ${d.observed_at}`}
          >
            {d.label}: <span className="text-ink">{d.value ?? "—"}</span> {d.unit}
          </span>
        ))}
      </div>
      <p className="flex items-start gap-1.5 text-[11px] text-faint">
        <Info aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
        {reply.uncertainty}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Badge color={reply.generated_by === "gemini" ? "#A78BFA" : "#94A89D"}>
          {reply.generated_by === "gemini" ? "Gemini · grounded" : "Rule-based answer"}
        </Badge>
        {reply.is_demo && <Badge color="#A78BFA">sample data</Badge>}
        {reply.follow_ups.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => onAsk(f)}
            className="rounded-full border hairline px-2.5 py-0.5 text-[11px] text-muted hover:border-cyan/30 hover:text-ink"
          >
            {f}
          </button>
        ))}
      </div>
    </div>
  );
}

export function MessageBubble({ m, onAsk }: { m: ChatMessage; onAsk: (q: string) => void }) {
  const isUser = m.role === "user";
  const kind = isUser ? "user" : m.error ? "error" : "assistant";
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={isUser ? "flex justify-end" : "flex justify-start"}
    >
      <div className={isUser ? "flex max-w-[85%] flex-row-reverse gap-3" : "flex max-w-[92%] gap-3 md:max-w-[80%]"}>
        <span
          aria-hidden="true"
          className={
            isUser
              ? "grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-emerald/15 text-mint"
              : "grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-cyan/25 to-violet/25 text-cyan"
          }
        >
          {isUser ? <User aria-hidden="true" className="h-4 w-4" /> : <Bot aria-hidden="true" className="h-4 w-4" />}
        </span>
        <div className="min-w-0">
          <div className={BUBBLE_STYLE[kind]}>
            <span className="sr-only">{SPEAKER[kind]}</span>
            <Markdownish text={m.content} />
          </div>
          {m.reply && <ReplyDetails reply={m.reply} onAsk={onAsk} />}
        </div>
      </div>
    </motion.div>
  );
}
