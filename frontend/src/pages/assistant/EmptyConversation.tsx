import { motion } from "motion/react";
import { Sparkles } from "lucide-react";

const SUGGESTED = [
  "Why is the air quality poor today?",
  "Is it safe to play outside?",
  "How can I improve indoor air quality?",
  "What can my apartment do to reduce emissions?",
  "What is the best time for outdoor activities?",
  "How can we organize a low-emission event?",
];

/** Intro and suggested questions shown before the first message. */
export function EmptyConversation({ onAsk }: { onAsk: (q: string) => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-2xl py-8 text-center">
      <div className="relative mx-auto mb-5 grid h-16 w-16 place-items-center">
        <motion.div
          className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan/40 to-violet/40 blur-xl"
          animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0.9, 0.6] }}
          transition={{ duration: 3, repeat: Infinity }}
        />
        <div className="relative grid h-16 w-16 place-items-center rounded-2xl border border-cyan/30 bg-bg-2">
          <Sparkles aria-hidden="true" className="h-7 w-7 text-cyan" />
        </div>
      </div>
      <h2 className="font-display text-xl font-semibold">Ask about the air around you</h2>
      <p className="mt-2 text-sm text-muted">
        AIRenv AI reads the current readings, forecast and your household or community context. It never invents numbers and says when data
        is uncertain.
      </p>
      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        {SUGGESTED.map((s, i) => (
          <motion.button
            key={s}
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.05 }}
            whileHover={{ y: -2 }}
            onClick={() => onAsk(s)}
            className="rounded-xl border hairline bg-black/20 px-4 py-3 text-left text-sm text-ink/90 hover:border-cyan/30 hover:bg-cyan/5"
          >
            {s}
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

export function TypingIndicator() {
  return (
    <div role="status" className="flex items-center gap-1.5 px-1 py-2">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full bg-cyan"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
      <span className="ml-2 text-xs text-muted">Reading current conditions…</span>
    </div>
  );
}
