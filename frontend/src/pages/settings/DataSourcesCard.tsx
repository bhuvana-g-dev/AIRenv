import { Database } from "lucide-react";
import { Badge, Button, Card, CardHeader, Toggle } from "../../components/ui";
import type { SystemStatus } from "../../lib/types";
import { ALWAYS_ON_SOURCE, DATA_SOURCES } from "./constants";
import type { SectionProps } from "./hooks";

type Integration = SystemStatus["integrations"][string] | undefined;

function IntegrationBadge({ integ }: { integ: Integration }) {
  if (!integ) return null;
  return integ.configured ? <Badge color="#35D399">configured</Badge> : <Badge color="#FB923C">needs {integ.env}</Badge>;
}

export function DataSourcesCard({ draft, setDraft, saving, save, system }: SectionProps & { system: SystemStatus | undefined }) {
  return (
    <Card hover={false}>
      <CardHeader
        icon={<Database aria-hidden="true" className="h-4 w-4" />}
        title="Data sources"
        subtitle="Turn station providers on or off for the air map"
      />
      <div className="grid gap-x-8 md:grid-cols-2">
        {DATA_SOURCES.map(({ key, label, description }) => {
          const alwaysOn = key === ALWAYS_ON_SOURCE;
          return (
            <Toggle
              key={key}
              label={
                <span className="flex items-center gap-2">
                  {label}
                  <IntegrationBadge integ={system?.integrations[key]} />
                </span>
              }
              description={description}
              checked={alwaysOn ? true : (draft.data_sources[key] ?? true)}
              disabled={alwaysOn}
              onChange={(v) => setDraft({ ...draft, data_sources: { ...draft.data_sources, [key]: v } })}
            />
          );
        })}
      </div>
      <Button className="mt-3" loading={saving} onClick={() => save(["data_sources"])}>
        Save sources
      </Button>
    </Card>
  );
}
