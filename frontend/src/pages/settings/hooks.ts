import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, del, post } from "../../lib/api";
import { useProfile, useUpdateProfile } from "../../lib/queries";
import { downloadJson, profilePatch } from "../../lib/settings";
import { useApp, useToasts } from "../../lib/store";
import type { Profile } from "../../lib/types";

/** What every settings card receives: the shared draft, its setter and the save action. */
export interface SectionProps {
  draft: Profile;
  setDraft: (p: Profile) => void;
  saving: boolean;
  save: (fields: (keyof Profile)[]) => void;
}

/**
 * Editable copy of the profile. Each card saves only its own fields, so unsaved edits in one
 * card are not sent when another card is saved.
 */
export function useProfileDraft() {
  const profile = useProfile();
  const update = useUpdateProfile();
  const setLocation = useApp((s) => s.setLocation);
  const push = useToasts((s) => s.push);
  const [draft, setDraft] = useState<Profile | null>(null);

  useEffect(() => {
    if (profile.data) setDraft(profile.data);
  }, [profile.data]);

  const save = (fields: (keyof Profile)[]) => {
    if (!draft) return;
    update.mutate(profilePatch(draft, fields), {
      onSuccess: (p) => {
        if (fields.includes("location")) setLocation(p.location, true);
        push({ title: "Settings saved", tone: "success" });
      },
      onError: (e) => push({ title: "Could not save", message: e.message, tone: "danger" }),
    });
  };

  return { profile, draft, setDraft, save, saving: update.isPending };
}

export function useAccountData(onDeleted: () => void) {
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const deleteData = useMutation({
    mutationFn: () => del("/api/me/data"),
    onSuccess: () => {
      onDeleted();
      void qc.invalidateQueries();
      push({ title: "Your data was deleted", tone: "info" });
    },
  });
  const exportData = () =>
    api<unknown>("/api/me/export")
      .then((data) => downloadJson(data, "airenv-my-data.json"))
      .catch((e: Error) => push({ title: "Could not export data", message: e.message, tone: "danger" }));
  return { deleteData, exportData };
}

export interface TelegramStatus {
  configured: boolean;
  connected: boolean;
  mode: string | null;
  bot_username: string | null;
  error: string | null;
  privacy_note: string;
}

export interface LinkCode {
  code: string;
  deep_link: string | null;
  expires_at: string;
  bot_username: string | null;
}

export function useTelegramStatus() {
  return useQuery({ queryKey: ["tg-status"], queryFn: () => api<TelegramStatus>("/api/telegram/status") });
}

/** Generate a one-time link code for the bot, or unlink the account. */
export function useTelegramLink() {
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const code = useMutation({
    mutationFn: () => post<LinkCode>("/api/telegram/link-code"),
    onError: (e) => push({ title: "Could not create link", message: e.message, tone: "danger" }),
  });
  const unlink = useMutation({ mutationFn: () => del("/api/telegram/link"), onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }) });
  return { code, unlink };
}
