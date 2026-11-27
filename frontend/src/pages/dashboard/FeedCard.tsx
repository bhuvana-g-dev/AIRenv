import { Clock, Radio } from "lucide-react";
import { FeedList } from "../../components/env";
import { Card, CardHeader, EmptyState, LoadingRegion, Skeleton } from "../../components/ui";
import { useFeed } from "../../lib/queries";

export function FeedCard() {
  const feed = useFeed();
  return (
    <Card delay={0.25}>
      <CardHeader
        icon={<Radio aria-hidden="true" className="h-4 w-4" />}
        title="Live intelligence feed"
        subtitle="Events detected by AIRenv's background processing"
        action={
          <span className="relative mt-1 flex h-2 w-2" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-emerald opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald" />
          </span>
        }
      />
      {feed.isLoading ? (
        <LoadingRegion label="Loading feed…" className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </LoadingRegion>
      ) : feed.data && feed.data.items.length > 0 ? (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be keyboard-scrollable (WCAG 2.1.1)
        <div className="max-h-[420px] overflow-y-auto pr-1" role="region" aria-label="Live intelligence feed events" tabIndex={0}>
          <FeedList items={feed.data.items} max={20} live label="Detected events, newest first" />
        </div>
      ) : (
        <EmptyState
          icon={<Clock aria-hidden="true" className="h-5 w-5" />}
          title="Waiting for the first scheduled check"
          description="Events appear here as the scheduler detects changes: category shifts, rising pollution, forecast deterioration and community event risks."
        />
      )}
    </Card>
  );
}
