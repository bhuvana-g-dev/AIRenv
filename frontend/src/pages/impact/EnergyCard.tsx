import { Wind, Zap } from "lucide-react";
import { useState } from "react";
import { AnimatedNumber, Card, CardHeader, Field } from "../../components/ui";
import { Assumptions } from "./Assumptions";
import { useEnergyEstimate } from "./hooks";
import type { EnergyInput } from "./types";

export function EnergyCard() {
  const [energy, setEnergy] = useState<EnergyInput>({ electricity_kwh_saved_per_month: 30, lpg_kg_saved_per_month: 0 });
  const e = useEnergyEstimate(energy);
  return (
    <Card hover={false}>
      <CardHeader
        icon={<Zap aria-hidden="true" className="h-4 w-4" />}
        title="Energy alternative"
        subtitle="Estimated CO₂ from electricity or LPG saved"
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Electricity saved (kWh / month)">
          <input
            type="number"
            min={0}
            className="input"
            value={energy.electricity_kwh_saved_per_month}
            onChange={(ev) => setEnergy({ ...energy, electricity_kwh_saved_per_month: Math.max(0, Number(ev.target.value)) })}
          />
        </Field>
        <Field label="LPG saved (kg / month)">
          <input
            type="number"
            min={0}
            className="input"
            value={energy.lpg_kg_saved_per_month}
            onChange={(ev) => setEnergy({ ...energy, lpg_kg_saved_per_month: Math.max(0, Number(ev.target.value)) })}
          />
        </Field>
      </div>
      {e.data && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border hairline bg-black/15 p-3 text-center">
              <p className="text-[11px] text-muted">per month</p>
              <p className="font-display text-xl font-semibold text-cyan">
                <AnimatedNumber value={e.data.total_kg_per_month.estimate} digits={1} />
              </p>
              <p className="text-[10px] text-faint">
                kg CO₂ · {e.data.total_kg_per_month.low}–{e.data.total_kg_per_month.high}
              </p>
            </div>
            <div className="rounded-xl border hairline bg-black/15 p-3 text-center">
              <p className="text-[11px] text-muted">per year</p>
              <p className="font-display text-xl font-semibold text-cyan">
                <AnimatedNumber value={e.data.total_kg_per_year} digits={0} />
              </p>
              <p className="text-[10px] text-faint">kg CO₂ (estimate)</p>
            </div>
          </div>
          <Assumptions items={e.data.methodology} title="Methodology & uncertainty" />
        </div>
      )}
      <div className="mt-4 rounded-xl border border-cyan/20 bg-cyan/5 p-3 text-[11px] leading-relaxed text-muted">
        <Wind aria-hidden="true" className="mb-1 h-3.5 w-3.5 text-cyan" />
        CO₂e is a greenhouse-gas measure. Lower CO₂e often comes with lower local exhaust, but these figures do not describe changes in
        PM2.5 or AQI near you.
      </div>
    </Card>
  );
}
