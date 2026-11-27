import { FlaskConical } from "lucide-react";
import { useState } from "react";
import { RecommendationCard } from "../../components/env";
import { Card } from "../../components/ui";
import { communityRecommendations, splitEvents } from "../../lib/community";
import { useBriefing } from "../../lib/queries";
import type { CommunityDetail } from "../../lib/types";
import { AddEventModal } from "./AddEventModal";
import { ConversationTester } from "./ConversationTester";
import { ConcernsCard, EventsPanel } from "./EventsPanel";
import { GroupsPanel } from "./GroupsPanel";
import { Initiatives } from "./Initiatives";
import { OverviewStrip } from "./OverviewStrip";
import { ParticipationChart } from "./ParticipationChart";

function CommunityRecommendations() {
  const briefing = useBriefing();
  const recs = communityRecommendations(briefing.data?.recommendations ?? []);
  return (
    <div className="space-y-2 lg:col-span-2">
      <h2 className="label">Community recommendations</h2>
      {recs.length === 0 ? (
        <Card hover={false}>
          <p className="text-xs text-muted">No community-specific recommendations for current conditions.</p>
        </Card>
      ) : (
        recs.map((r, i) => <RecommendationCard key={r.id} rec={r} index={i} />)
      )}
    </div>
  );
}

/** Everything for one selected community: overview, activities, groups, initiatives and tools. */
export function CommunityDetailView({ detail: d }: { detail: CommunityDetail }) {
  const [addEvent, setAddEvent] = useState(false);
  const { upcoming, concerns } = splitEvents(d.events);
  const { id: cid, can_manage: canManage } = d.community;
  return (
    <div className="space-y-4">
      {d.community.is_demo && (
        <div className="flex items-center gap-2 rounded-xl border border-violet/30 bg-violet/10 px-4 py-2 text-xs text-violet-100">
          <FlaskConical aria-hidden="true" className="h-4 w-4 shrink-0 text-violet" /> Demo community. Events and initiatives are samples;
          their risk assessments use the real forecast.
        </div>
      )}
      <OverviewStrip detail={d} />
      <div className="grid gap-4 lg:grid-cols-3">
        <EventsPanel events={upcoming} cid={cid} canManage={canManage} onAdd={() => setAddEvent(true)} />
        <div className="space-y-4">
          <ConcernsCard concerns={concerns} />
          <GroupsPanel detail={d} />
        </div>
        <Initiatives detail={d} />
        <ParticipationChart stats={d.stats} />
        <CommunityRecommendations />
        <ConversationTester community={d.community} />
      </div>
      <AddEventModal cid={cid} open={addEvent} onClose={() => setAddEvent(false)} />
    </div>
  );
}
