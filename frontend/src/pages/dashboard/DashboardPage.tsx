import { DataUnavailable, DemoBanner, FreshnessPill, Provenance, StaleBanner } from "../../components/env";
import { LoadingRegion, PageHeader, Skeleton } from "../../components/ui";
import { useBundle } from "../../lib/queries";
import { useApp } from "../../lib/store";
import { BestWindowsCard } from "./BestWindowsCard";
import { BriefingCard } from "./BriefingCard";
import { CurrentAirCard, PollutantsCard } from "./CurrentAirCards";
import { FeedCard } from "./FeedCard";
import { HistoryCard } from "./HistoryCard";
import { StatusCard } from "./StatusCard";
import { TrendCard } from "./TrendCard";

function DashboardSkeleton() {
  return (
    <LoadingRegion label="Loading air-quality dashboard…" className="space-y-4">
      <Skeleton className="h-10 w-80" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-[340px]" />
        <Skeleton className="h-[340px]" />
        <Skeleton className="h-[340px]" />
      </div>
      <Skeleton className="h-64" />
    </LoadingRegion>
  );
}

export default function DashboardPage() {
  const bundle = useBundle();
  const setDemo = useApp((s) => s.setDemo);
  const demo = useApp((s) => s.demo);

  if (bundle.isLoading) return <DashboardSkeleton />;
  if (bundle.isError || !bundle.data) {
    return (
      <DataUnavailable
        message={bundle.error?.message ?? "Unknown error"}
        onRetry={() => void bundle.refetch()}
        onDemo={() => setDemo(true)}
      />
    );
  }
  const { snapshot, series } = bundle.data;

  return (
    <div>
      {(demo || snapshot.is_demo) && <DemoBanner />}
      <StaleBanner snapshot={snapshot} />
      <PageHeader
        eyebrow="Intelligence dashboard"
        title={
          <>
            Air around <span className="text-gradient">{snapshot.location.name}</span>
          </>
        }
        description={<Provenance snapshot={snapshot} />}
        actions={<FreshnessPill snapshot={snapshot} />}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <CurrentAirCard snapshot={snapshot} />
        <PollutantsCard snapshot={snapshot} />
        <StatusCard analysis={snapshot.analysis} />
        <BriefingCard />
        <FeedCard />
        <TrendCard series={series} />
        <HistoryCard />
        <BestWindowsCard series={series} />
      </div>
    </div>
  );
}
