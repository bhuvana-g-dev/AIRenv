import { FlaskConical, Plus, Trash2, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Card, EmptyState, ErrorState, PageHeader, Skeleton } from "../../components/ui";
import { resolveSelection } from "../../lib/community";
import { useCommunities, useCommunityDetail } from "../../lib/queries";
import { CommunityDetailView } from "./CommunityDetailView";
import { CommunityPicker } from "./CommunityPicker";
import { CreateCommunityModal } from "./CreateCommunityModal";
import { useDemoCommunities } from "./hooks";

export default function CommunityPage() {
  const list = useCommunities();
  const [selected, setSelected] = useState<string | null>(null);
  const [create, setCreate] = useState(false);
  const detail = useCommunityDetail(selected);
  const { seed, unseed } = useDemoCommunities(() => setSelected(null));
  const communities = list.data?.communities ?? [];
  const hasDemo = communities.some((c) => c.is_demo);

  useEffect(() => {
    const next = resolveSelection(list.data?.communities ?? [], selected);
    if (next !== selected) setSelected(next);
  }, [list.data, selected]);

  const loadDemo = (
    <Button
      variant="outline"
      size="sm"
      icon={<FlaskConical aria-hidden="true" className="h-3.5 w-3.5" />}
      loading={seed.isPending}
      onClick={() => seed.mutate()}
    >
      Load demo communities
    </Button>
  );
  const removeDemo = (
    <Button
      variant="ghost"
      size="sm"
      icon={<Trash2 aria-hidden="true" className="h-3.5 w-3.5" />}
      loading={unseed.isPending}
      onClick={() => unseed.mutate()}
    >
      Remove demo data
    </Button>
  );

  return (
    <div>
      <PageHeader
        eyebrow="Community intelligence"
        title="Protect the people you organise"
        description="Schools, apartments and associations: see upcoming activities checked against the forecast, approve advisories, and track verified initiatives."
        actions={
          <>
            {hasDemo ? removeDemo : loadDemo}
            <Button size="sm" icon={<Plus aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => setCreate(true)}>
              New community
            </Button>
          </>
        }
      />
      <CreateCommunityModal open={create} onClose={() => setCreate(false)} />

      {list.isLoading ? (
        <Skeleton className="h-64" label="Loading communities…" />
      ) : list.isError ? (
        <ErrorState message={list.error.message} />
      ) : communities.length === 0 ? (
        <Card hover={false}>
          <EmptyState
            icon={<Users aria-hidden="true" className="h-5 w-5" />}
            title="No communities yet"
            description="Create a community for your school, apartment or association, or load clearly labelled demo communities to explore the features."
            action={
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setCreate(true)}>
                  Create community
                </Button>
                <Button size="sm" variant="outline" onClick={() => seed.mutate()} loading={seed.isPending}>
                  Load demo
                </Button>
              </div>
            }
          />
        </Card>
      ) : (
        <>
          <CommunityPicker communities={communities} selected={selected} onSelect={setSelected} />
          {detail.isLoading || !detail.data ? (
            <Skeleton className="h-96" label="Loading community details…" />
          ) : (
            <CommunityDetailView detail={detail.data} />
          )}
        </>
      )}
    </div>
  );
}
