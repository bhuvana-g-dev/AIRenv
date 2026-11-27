import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { AqiGauge } from "../../components/env";
import { Badge } from "../../components/ui";
import { api } from "../../lib/api";
import { CATEGORY_COLORS, colorForAqi } from "../../lib/aqi";
import { sampleReading, type SampleState } from "../../lib/landingSample";
import type { Snapshot } from "../../lib/types";

const SAMPLE_POLLUTANTS = [
  { key: "pm2_5", label: "PM2.5" },
  { key: "pm10", label: "PM10" },
  { key: "no2", label: "NO₂" },
] as const;

/** Fetches the default-location snapshot once; `failed` flips when the service is unreachable. */
function useLiveSample() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    api<Snapshot>("/api/air/current", { timeoutMs: 12000 })
      .then(setSnap)
      .catch(() => setFailed(true));
  }, []);
  return sampleReading(snap, failed);
}

function StateBadge({ state }: { state: SampleState }) {
  if (state === "live")
    return (
      <Badge color="#35D399" dot>
        Live · model estimate
      </Badge>
    );
  if (state === "failed") return <Badge color="#A78BFA">Demonstration data</Badge>;
  return <Badge color="#94A89D">Loading</Badge>;
}

export function LiveSample() {
  const reading = useLiveSample();
  const { value, category, pollutants: pm } = reading;
  const color = colorForAqi(value);
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 1, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="glass relative rounded-[28px] p-6"
    >
      <div
        className="absolute -inset-px -z-10 rounded-[28px] opacity-60 blur-2xl"
        style={{ background: `radial-gradient(closest-side, ${color}30, transparent)` }}
      />
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{reading.place}</p>
          <p role="status" className="text-[11px] text-faint">
            {reading.status}
          </p>
        </div>
        <StateBadge state={reading.state} />
      </div>
      <div className="flex justify-center">
        <AqiGauge value={value} category={category} size={230} />
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2">
        {SAMPLE_POLLUTANTS.map(({ key, label }, i) => (
          <div key={key} className="rounded-xl border hairline bg-black/20 p-2.5 text-center">
            <p className="text-[10px] text-muted">{label}</p>
            <p className="font-display text-lg font-semibold">{pm ? Math.round(pm[key] ?? 0) : "—"}</p>
            <motion.div
              className="mx-auto mt-1 h-0.5 rounded-full"
              style={{ background: CATEGORY_COLORS[category?.key ?? "good"] }}
              initial={{ width: 0 }}
              animate={{ width: pm ? "60%" : 0 }}
              transition={{ delay: 0.8 + i * 0.1, duration: 0.8 }}
            />
            <p className="mt-1 text-[9px] text-faint">µg/m³</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-center text-[10px] leading-relaxed text-faint">{reading.footnote}</p>
    </motion.div>
  );
}
