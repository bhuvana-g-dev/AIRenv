import { motion } from "motion/react";
import { Car } from "lucide-react";
import { useState } from "react";
import { AnimatedNumber, Card, CardHeader, Field } from "../../components/ui";
import { fmtNum } from "../../lib/format";
import { relativeWidthPct } from "../../lib/impact";
import { Assumptions } from "./Assumptions";
import { useEmissionFactors, useTripEstimate } from "./hooks";
import type { TripInput, TripResult } from "./types";

const INITIAL_TRIP: TripInput = {
  baseline_mode: "petrol_car",
  alternative_mode: "metro",
  distance_km: 10,
  trips_per_week: 10,
  baseline_occupants: 1,
  alternative_occupants: 1,
};

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  return (
    <Field label={label}>
      <input type="number" min={min} max={max} className="input" value={value} onChange={(ev) => onChange(Number(ev.target.value))} />
    </Field>
  );
}

function TripResults({ data }: { data: TripResult }) {
  const rows = [
    { l: "Current", v: data.baseline_kg_per_week, c: "#FB923C" },
    { l: "Alternative", v: data.alternative_kg_per_week, c: "#35D399" },
  ];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {(["week", "month", "year"] as const).map((p) => (
          <div key={p} className="rounded-xl border hairline bg-black/15 p-3 text-center">
            <p className="text-[11px] capitalize text-muted">per {p}</p>
            <p className="font-display text-xl font-semibold text-cyan">
              <AnimatedNumber value={data.avoided_kg[p].estimate} digits={1} />
            </p>
            <p className="text-[10px] text-faint">
              kg CO₂e · {fmtNum(data.avoided_kg[p].low, 1)}–{fmtNum(data.avoided_kg[p].high, 1)}
            </p>
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        {rows.map((b) => (
          <div key={b.l} className="flex items-center gap-3 text-xs">
            <span className="w-20 text-muted">{b.l}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/5" aria-hidden="true">
              <motion.div
                className="h-full rounded-full"
                style={{ background: b.c }}
                initial={{ width: 0 }}
                animate={{ width: `${relativeWidthPct(b.v, data.baseline_kg_per_week, data.alternative_kg_per_week)}%` }}
                transition={{ duration: 0.8 }}
              />
            </div>
            <span className="w-24 text-right tabular-nums">{fmtNum(b.v, 1)} kg/wk</span>
          </div>
        ))}
      </div>
      <Assumptions items={[...data.methodology, data.source]} title="Methodology & uncertainty" />
    </motion.div>
  );
}

export function TripCard() {
  const factors = useEmissionFactors();
  const [trip, setTrip] = useState(INITIAL_TRIP);
  const t = useTripEstimate(trip);
  const modes = factors.data ? Object.entries(factors.data.transport) : [];
  const isCar = (m: string) => factors.data?.transport[m]?.per === "vehicle";
  const set = (changes: Partial<TripInput>) => setTrip({ ...trip, ...changes });
  const modeOptions = modes.map(([k, v]) => (
    <option key={k} value={k}>
      {v.label}
    </option>
  ));

  return (
    <Card hover={false}>
      <CardHeader
        icon={<Car aria-hidden="true" className="h-4 w-4" />}
        title="Transport alternative"
        subtitle="Estimated CO₂e avoided by switching mode"
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Current mode">
          <select className="input" value={trip.baseline_mode} onChange={(ev) => set({ baseline_mode: ev.target.value })}>
            {modeOptions}
          </select>
        </Field>
        <Field label="Alternative">
          <select className="input" value={trip.alternative_mode} onChange={(ev) => set({ alternative_mode: ev.target.value })}>
            {modeOptions}
          </select>
        </Field>
        <NumberField
          label="One-way distance (km)"
          min={1}
          max={500}
          value={trip.distance_km}
          onChange={(v) => set({ distance_km: Math.max(0.1, v) })}
        />
        <NumberField
          label="Trips per week"
          min={1}
          max={50}
          value={trip.trips_per_week}
          onChange={(v) => set({ trips_per_week: Math.max(1, v) })}
        />
        {isCar(trip.baseline_mode) && (
          <NumberField
            label="People in current vehicle"
            min={1}
            max={8}
            value={trip.baseline_occupants}
            onChange={(v) => set({ baseline_occupants: v })}
          />
        )}
        {isCar(trip.alternative_mode) && (
          <NumberField
            label="People sharing (carpool)"
            min={1}
            max={8}
            value={trip.alternative_occupants}
            onChange={(v) => set({ alternative_occupants: v })}
          />
        )}
      </div>
      {t.data && <TripResults data={t.data} />}
      {t.isError && (
        <p role="alert" className="mt-3 text-xs text-orange-300">
          {t.error.message}
        </p>
      )}
    </Card>
  );
}
