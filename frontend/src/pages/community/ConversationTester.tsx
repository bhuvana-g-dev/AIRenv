import { motion } from "motion/react";
import { MessageSquareText } from "lucide-react";
import { useState } from "react";
import { Button, Card, CardHeader } from "../../components/ui";
import type { Community } from "../../lib/types";
import { useAnalyzeConversation, type ConversationAnalysis } from "./hooks";

const EXAMPLES = [
  "Let's burn the dry leaves near the gate on Sunday",
  "Cricket practice on Saturday 7 am in the ground",
  "Happy birthday Riya!",
];
const SHOWN_FIELDS = ["kind", "activity_type", "concern_type", "date", "time", "outdoor", "intensity"];

function AnalysisResult({ data }: { data: ConversationAnalysis }) {
  const event = data.event;
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-3 space-y-2 text-xs">
      {!data.relevant ? (
        <p className="rounded-xl border hairline bg-black/15 p-3 text-muted">
          Not environmentally relevant. AIRenv would ignore this message and not reply.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {SHOWN_FIELDS.filter((k) => event?.[k] != null).map((k) => (
              <span key={k} className="rounded-md border hairline bg-white/[0.02] px-2 py-1 font-mono text-[10px]">
                {k}: <span className="text-cyan">{String(event?.[k])}</span>
              </span>
            ))}
          </div>
          {data.risk?.summary && <p className="text-muted">{data.risk.summary}</p>}
          <p className={data.respond ? "text-yellow-300" : "text-emerald"}>
            {data.respond ? "A reply is warranted. Draft advisory:" : "No reply needed: conditions don't warrant one."}
          </p>
          {data.advisory && <p className="rounded-xl border border-cyan/20 bg-cyan/5 p-3 leading-relaxed">{data.advisory}</p>}
        </>
      )}
      <p className="text-[10px] text-faint">{data.privacy}</p>
    </motion.div>
  );
}

export function ConversationTester({ community }: { community: Community }) {
  const [text, setText] = useState("Tomorrow we are conducting outdoor sports activities at 3 PM.");
  const m = useAnalyzeConversation();
  const analyse = () =>
    m.mutate({
      text,
      lat: community.location.lat,
      lon: community.location.lon,
      audience: community.type === "school" ? "school" : "general",
    });
  return (
    <Card hover={false}>
      <CardHeader
        icon={<MessageSquareText aria-hidden="true" className="h-4 w-4 text-cyan" />}
        title="Conversation Intelligence test"
        subtitle="See what AIRenv would extract from a group message. Nothing is stored."
      />
      <textarea
        aria-label="Group message to analyse"
        className="input min-h-20 text-sm"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={1000}
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {EXAMPLES.map((s) => (
          <button
            type="button"
            key={s}
            onClick={() => setText(s)}
            aria-label={`Use example message: ${s}`}
            className="rounded-full border hairline px-2.5 py-0.5 text-[11px] text-muted hover:text-ink"
          >
            {s}
          </button>
        ))}
      </div>
      <Button className="mt-3" variant="ai" size="sm" loading={m.isPending} disabled={text.trim().length < 3} onClick={analyse}>
        Analyse message
      </Button>
      {m.isError && (
        <p role="alert" className="mt-2 text-xs text-orange-300">
          {m.error.message}
        </p>
      )}
      <div aria-live="polite">{m.data && <AnalysisResult data={m.data} />}</div>
    </Card>
  );
}
