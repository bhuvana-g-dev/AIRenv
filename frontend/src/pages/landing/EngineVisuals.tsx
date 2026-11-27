import { motion, useReducedMotion } from "motion/react";
import { MessageCircle, Radar, Sparkles } from "lucide-react";
import { Badge } from "../../components/ui";
import { colorForAqi } from "../../lib/aqi";
import { ILLUSTRATIVE_PM_BARS, RECOMMENDATION_FIELDS, type EngineId } from "./content";

/** Map an illustrative PM2.5 bar height to a representative AQI for its colour. */
const barAqi = (b: number) => (b > 200 ? 320 : b > 120 ? 220 : b > 90 ? 150 : 80);

function ConversationVisual() {
  return (
    <div className="rounded-2xl border hairline bg-[#0b1620] p-4">
      <div className="mb-3 flex items-center justify-between text-xs text-muted">
        <span className="flex items-center gap-2">
          <MessageCircle aria-hidden="true" className="h-3.5 w-3.5 text-cyan" /> Sunrise School Parents
        </span>
        <Badge color="#94A89D">Example</Badge>
      </div>
      <div className="space-y-3">
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white/5 px-3.5 py-2.5 text-sm"
        >
          Tomorrow we are conducting outdoor sports activities at 3 PM.
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.6 }}
          className="flex items-center gap-2 pl-1 text-[10px] text-faint"
        >
          <Sparkles aria-hidden="true" className="h-3 w-3 text-violet" /> extracted: sports · tomorrow · 15:00 · outdoor · message text
          discarded
        </motion.div>
        <motion.div
          initial={{ opacity: 0, x: 10 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 1.1 }}
          className="ml-auto max-w-[90%] rounded-2xl rounded-tr-sm border border-cyan/20 bg-cyan/10 px-3.5 py-2.5 text-sm"
        >
          🌫️ Tomorrow's forecast indicates elevated PM2.5 around the planned activity. Consider moving strenuous outdoor activities indoors
          or rescheduling them. Check the latest conditions before the event.
        </motion.div>
        <p className="text-right text-[10px] text-faint">posted after admin approval</p>
      </div>
    </div>
  );
}

function DecisionVisual() {
  const reduce = useReducedMotion();
  return (
    <div className="rounded-2xl border hairline bg-black/25 p-5">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles aria-hidden="true" className="h-4 w-4 text-violet" />
        <span className="text-sm font-semibold">Every recommendation answers six questions</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {RECOMMENDATION_FIELDS.map((f, i) => (
          <motion.div
            key={f}
            initial={reduce ? false : { opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08 }}
            className="rounded-xl border hairline bg-gradient-to-br from-violet/10 to-cyan/5 px-3 py-3 text-xs"
          >
            <span className="font-mono text-[10px] text-faint">0{i + 1}</span>
            <p className="mt-1 font-medium">{f}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function AmbientVisual() {
  return (
    <div className="rounded-2xl border hairline bg-black/25 p-5">
      <div className="mb-4 flex items-center justify-between text-xs text-muted">
        <span className="flex items-center gap-2">
          <Radar aria-hidden="true" className="h-3.5 w-3.5 text-mint" /> Hourly PM2.5 pattern
        </span>
        <Badge color="#94A89D">Illustration</Badge>
      </div>
      <div className="flex h-40 items-end gap-1.5">
        {ILLUSTRATIVE_PM_BARS.map((b, i) => (
          <motion.div
            key={i}
            className="flex-1 rounded-t-md"
            style={{ background: colorForAqi(barAqi(b)) }}
            initial={{ height: 0, opacity: 0.4 }}
            whileInView={{ height: `${(b / 240) * 100}%`, opacity: 0.85 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.04, duration: 0.6 }}
          />
        ))}
      </div>
      <div className="mt-3 flex justify-between text-[10px] text-faint">
        <span>06:00</span>
        <span>cleaner window</span>
        <span>evening build-up</span>
      </div>
    </div>
  );
}

export function EngineVisual({ id }: { id: EngineId }) {
  if (id === "conversation") return <ConversationVisual />;
  if (id === "decision") return <DecisionVisual />;
  return <AmbientVisual />;
}
