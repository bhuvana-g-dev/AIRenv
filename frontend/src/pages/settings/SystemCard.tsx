import { CheckCircle2, Server, XCircle } from "lucide-react";
import { Card, CardHeader, Skeleton } from "../../components/ui";
import { timeAgo } from "../../lib/format";
import type { SystemStatus } from "../../lib/types";

function StatusRows({ system }: { system: SystemStatus }) {
  const { scheduler } = system;
  const rows: [string, string | number][] = [
    ["Storage", system.storage],
    ["Auth mode", system.auth_mode],
    ["Scheduler", scheduler.enabled ? `every ${scheduler.interval_minutes} min` : "disabled"],
    ["Last run", timeAgo(scheduler.last_run_at)],
    ["Runs since start", scheduler.runs],
    ["Live subscribers", system.live_subscribers],
  ];
  return (
    <ul className="space-y-1.5 text-xs text-muted">
      {rows.map(([label, value]) => (
        <li key={label} className="flex justify-between">
          <span>{label}</span>
          <span className="text-ink">{value}</span>
        </li>
      ))}
      {scheduler.last_errors.length > 0 && <li className="text-orange-300">{scheduler.last_errors.join("; ")}</li>}
    </ul>
  );
}

export function SystemCard({ system }: { system: SystemStatus | undefined }) {
  return (
    <Card hover={false}>
      <CardHeader
        icon={<Server aria-hidden="true" className="h-4 w-4" />}
        title="System status"
        subtitle="Backend integrations and background processing"
      />
      {system ? (
        <div className="grid gap-4 md:grid-cols-2">
          <ul className="space-y-1.5 text-xs">
            {Object.entries(system.integrations).map(([k, v]) => (
              <li key={k} className="flex items-center justify-between rounded-lg bg-black/15 px-3 py-2">
                <span className="flex items-center gap-2 capitalize">
                  {v.configured ? (
                    <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5 text-emerald" />
                  ) : (
                    <XCircle aria-hidden="true" className="h-3.5 w-3.5 text-faint" />
                  )}
                  <span className="sr-only">{v.configured ? "Configured:" : "Not configured:"}</span>
                  {k.replace("_", " ")}
                </span>
                <span className="font-mono text-[10px] text-faint">{v.configured ? "ready" : v.env}</span>
              </li>
            ))}
          </ul>
          <StatusRows system={system} />
        </div>
      ) : (
        <Skeleton className="h-32" label="Loading system status…" />
      )}
    </Card>
  );
}
