import { CalendarClock, Flame, Plus } from "lucide-react";
import { Button, Card, CardHeader, EmptyState } from "../../components/ui";
import type { CommunityEvent } from "../../lib/types";
import { EventRow } from "./EventRow";

export function EventsPanel({
  events,
  cid,
  canManage,
  onAdd,
}: {
  events: CommunityEvent[];
  cid: string;
  canManage: boolean;
  onAdd: () => void;
}) {
  return (
    <Card hover={false} className="lg:col-span-2">
      <CardHeader
        icon={<CalendarClock aria-hidden="true" className="h-4 w-4" />}
        title="Upcoming activities & alerts"
        subtitle="From connected groups or added manually. Re-assessed on every refresh."
        action={
          canManage && (
            <Button size="sm" variant="outline" icon={<Plus aria-hidden="true" className="h-3.5 w-3.5" />} onClick={onAdd}>
              Activity
            </Button>
          )
        }
      />
      {events.length === 0 ? (
        <EmptyState
          title="No upcoming activities"
          description="Activities announced in opted-in Telegram groups appear here automatically."
        />
      ) : (
        <ul className="space-y-2.5">
          {events.map((ev) => (
            <EventRow key={ev.id} ev={ev} cid={cid} canManage={canManage} />
          ))}
        </ul>
      )}
    </Card>
  );
}

export function ConcernsCard({ concerns }: { concerns: CommunityEvent[] }) {
  return (
    <Card hover={false}>
      <CardHeader icon={<Flame aria-hidden="true" className="h-4 w-4 text-orange-300" />} title="Environmental concerns" />
      {concerns.length === 0 ? (
        <p className="text-xs text-muted">No concerns detected. AIRenv flags open-burning discussions in opted-in groups.</p>
      ) : (
        <ul className="space-y-2">
          {concerns.map((c) => (
            <li key={c.id} className="rounded-xl border border-orange-400/20 bg-orange-400/5 p-3 text-xs">
              <p className="font-medium">{c.title}</p>
              <p className="mt-1 text-muted">
                {c.advisory?.text ?? "Safer alternatives: segregate waste for municipal collection; compost leaves."}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
