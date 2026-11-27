import { useState } from "react";
import { Badge, Button, ErrorState, Modal, PageHeader, Skeleton } from "../../components/ui";
import { useSystemStatus } from "../../lib/queries";
import { DataSourcesCard } from "./DataSourcesCard";
import { useAccountData, useProfileDraft } from "./hooks";
import { NotificationsCard } from "./NotificationsCard";
import { PrivacyCard } from "./PrivacyCard";
import { ProfileCard } from "./ProfileCard";
import { SettingsNav } from "./SettingsNav";
import { SystemCard } from "./SystemCard";
import { TelegramCard } from "./TelegramCard";

function DeleteDataModal({
  open,
  onClose,
  deleting,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  deleting: boolean;
  onConfirm: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Delete your data?">
      <p className="text-sm text-muted">
        This permanently deletes your profile, preferences and notifications. Communities you administer are not deleted. This cannot be
        undone.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" loading={deleting} onClick={onConfirm}>
          Delete permanently
        </Button>
      </div>
    </Modal>
  );
}

export default function SettingsPage() {
  const { profile, draft, setDraft, save, saving } = useProfileDraft();
  const system = useSystemStatus();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [active, setActive] = useState("profile");
  const { deleteData, exportData } = useAccountData(() => setConfirmDelete(false));

  // Check the error first: a failed load never produces a draft, so the skeleton would otherwise stay forever.
  if (profile.isError) return <ErrorState message={profile.error.message} />;
  if (profile.isLoading || !draft) return <Skeleton className="h-96" label="Loading settings…" />;

  const section = { draft, setDraft, saving, save };

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Profile & preferences"
        description="A one-time setup. AIRenv never asks for daily activity logs."
        actions={
          <Badge color={draft.role === "admin" ? "#A78BFA" : "#7CE7B4"}>
            {draft.role.replace("_", " ")} · {draft.auth_mode} auth
          </Badge>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <SettingsNav active={active} onSelect={setActive} />
        <div className="space-y-5">
          <section id="profile" className="scroll-mt-24 space-y-4">
            <ProfileCard {...section} />
          </section>
          <section id="notifications" className="scroll-mt-24">
            <NotificationsCard {...section} />
          </section>
          <section id="telegram" className="scroll-mt-24">
            <TelegramCard profile={draft} />
          </section>
          <section id="privacy" className="scroll-mt-24">
            <PrivacyCard {...section} onExport={() => void exportData()} onDelete={() => setConfirmDelete(true)} />
          </section>
          <section id="sources" className="scroll-mt-24">
            <DataSourcesCard {...section} system={system.data} />
          </section>
          <section id="system" className="scroll-mt-24">
            <SystemCard system={system.data} />
          </section>
        </div>
      </div>
      <DeleteDataModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        deleting={deleteData.isPending}
        onConfirm={() => deleteData.mutate()}
      />
    </div>
  );
}
