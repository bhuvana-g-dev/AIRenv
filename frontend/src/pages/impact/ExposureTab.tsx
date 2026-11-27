import { ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DemoBanner } from "../../components/env";
import { Card, CardHeader, EmptyState, Field, Skeleton } from "../../components/ui";
import { localDayHour } from "../../lib/format";
import { daytimeStartOptions, defaultPlannedStart } from "../../lib/impact";
import { useBundle } from "../../lib/queries";
import { Assumptions } from "./Assumptions";
import { ExposureForecastCard } from "./ExposureForecastCard";
import { ExposureSummary } from "./ExposureSummary";
import { useExposureEstimate } from "./hooks";

export function ExposureTab() {
  const bundle = useBundle();
  const [hours, setHours] = useState(1);
  const [intensity, setIntensity] = useState("moderate");
  const [planned, setPlanned] = useState<string>("");
  const options = useMemo(() => daytimeStartOptions(bundle.data?.series), [bundle.data]);
  useEffect(() => {
    const initial = defaultPlannedStart(options);
    if (!planned && initial) setPlanned(initial);
  }, [options, planned]);

  const m = useExposureEstimate(planned, hours, intensity);
  const r = m.data;

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <Card hover={false}>
        <CardHeader
          icon={<ShieldCheck aria-hidden="true" className="h-4 w-4" />}
          title="Personal exposure"
          subtitle="Compare an activity at different times"
        />
        <div className="space-y-3">
          <Field label="Planned start (forecast hours)">
            <select className="input" value={planned} onChange={(e) => setPlanned(e.target.value)}>
              {options.map((t) => (
                <option key={t} value={t}>
                  {localDayHour(t)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Activity intensity">
            <select className="input" value={intensity} onChange={(e) => setIntensity(e.target.value)}>
              <option value="sedentary">Sedentary (sitting outdoors)</option>
              <option value="light">Light (slow walk)</option>
              <option value="moderate">Moderate (brisk walk, play)</option>
              <option value="high">High (running, sports)</option>
            </select>
          </Field>
          <Field label={`Duration: ${hours} h`}>
            <input
              type="range"
              min={1}
              max={4}
              step={1}
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="w-full accent-emerald-400"
            />
          </Field>
        </div>
        {r && (
          <div className="mt-4">
            <Assumptions items={r.assumptions} />
          </div>
        )}
      </Card>
      <div className="space-y-4">
        {m.isPending && !r ? (
          <Skeleton className="h-80" label="Calculating exposure…" />
        ) : m.isError ? (
          <Card hover={false}>
            <EmptyState title="Exposure estimate unavailable" description={m.error.message} />
          </Card>
        ) : r ? (
          <>
            {r.is_demo && <DemoBanner />}
            <ExposureSummary result={r} />
            <ExposureForecastCard result={r} hours={hours} />
          </>
        ) : null}
      </div>
    </div>
  );
}
