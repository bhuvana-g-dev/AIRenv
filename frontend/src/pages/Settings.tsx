import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Bell, CheckCircle2, Database, Download, ExternalLink, Lock, MapPin, MessageCircle, Server, Trash2, User, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { LocationSearch } from "../components/LocationPicker";
import { COMMUNITY_TYPES, FAMILY_FIELDS } from "../components/Onboarding";
import { Badge, Button, Card, CardHeader, ErrorState, Field, Modal, PageHeader, Skeleton, Toggle, cn } from "../components/ui";
import { api, del, post } from "../lib/api";
import { timeAgo } from "../lib/format";
import { useProfile, useSystemStatus, useUpdateProfile } from "../lib/queries";
import { useApp, useToasts } from "../lib/store";
import type { Profile } from "../lib/types";

const LANGUAGES = [
  ["en", "English"],
  ["hi", "हिन्दी (Hindi)"],
  ["ta", "தமிழ் (Tamil)"],
  ["bn", "বাংলা (Bengali)"],
  ["mr", "मराठी (Marathi)"],
  ["te", "తెలుగు (Telugu)"],
  ["kn", "ಕನ್ನಡ (Kannada)"],
  ["pa", "ਪੰਜਾਬੀ (Punjabi)"],
];
const CATEGORY_LABELS: Record<string, string> = {
  critical: "Critical environmental alerts",
  deterioration: "Pollution deterioration",
  forecast: "Forecast warnings",
  community: "School & community activity concerns",
  recommendation: "AI-generated recommendations",
  positive: "Positive environmental developments",
};
const SECTIONS = [
  { id: "profile", label: "Profile & location", icon: User },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "telegram", label: "Telegram", icon: MessageCircle },
  { id: "privacy", label: "Privacy", icon: Lock },
  { id: "sources", label: "Data sources", icon: Database },
  { id: "system", label: "System", icon: Server },
];

function TelegramSection({ profile }: { profile: Profile }) {
  const status = useQuery({ queryKey: ["tg-status"], queryFn: () => api<{ configured: boolean; connected: boolean; mode: string | null; bot_username: string | null; error: string | null; privacy_note: string }>("/api/telegram/status") });
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const code = useMutation({ mutationFn: () => post<{ code: string; deep_link: string | null; expires_at: string; bot_username: string | null }>("/api/telegram/link-code") });
  const unlink = useMutation({ mutationFn: () => del("/api/telegram/link"), onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }) });
  const s = status.data;
  return (
    <Card hover={false}>
      <CardHeader icon={<MessageCircle className="h-4 w-4 text-cyan" />} title="Telegram connection" subtitle="Receive alerts without opening AIRenv, and enable Conversation Intelligence in groups" />
      {status.isLoading ? (
        <Skeleton className="h-20" />
      ) : !s?.configured ? (
        <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/5 p-3.5 text-xs leading-relaxed text-muted">
          <p className="font-medium text-yellow-100">Telegram is not configured on this server.</p>
          <p className="mt-1">
            Create a bot with <b>@BotFather</b>, then set <code className="text-cyan">TELEGRAM_BOT_TOKEN</code> (and <code className="text-cyan">TELEGRAM_MODE</code>=polling locally or webhook with <code className="text-cyan">TELEGRAM_WEBHOOK_SECRET</code> and <code className="text-cyan">PUBLIC_BASE_URL</code> in production) in the backend environment and restart.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge color={s.connected ? "#35D399" : "#FB923C"} dot>
              {s.connected ? "Bot connected" : "Bot unreachable"}
            </Badge>
            {s.bot_username && <span className="text-muted">@{s.bot_username}</span>}
            {s.mode && <span className="text-faint">mode: {s.mode}</span>}
            {s.error && <span className="text-orange-300">{s.error}</span>}
          </div>
          {profile.telegram ? (
            <div className="flex items-center justify-between rounded-xl border border-emerald/25 bg-emerald/5 p-3 text-xs">
              <span>
                Linked{profile.telegram.username ? ` as @${profile.telegram.username}` : ""} · {timeAgo(profile.telegram.linked_at)}
              </span>
              <Button size="sm" variant="ghost" onClick={() => unlink.mutate()} loading={unlink.isPending}>
                Unlink
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border hairline bg-black/15 p-3 text-xs">
              <p className="text-muted">Link your account to get alerts in a private chat with the bot.</p>
              {code.data ? (
                <div className="mt-2 space-y-2">
                  {code.data.deep_link ? (
                    <a href={code.data.deep_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-cyan/15 px-3 py-1.5 text-cyan hover:bg-cyan/25">
                      Open Telegram to link <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <p>
                      Send <code className="text-cyan">/start {code.data.code}</code> to the bot.
                    </p>
                  )}
                  <p className="text-faint">Code expires {timeAgo(code.data.expires_at).replace("ago", "from now")}. Refresh this page after linking.</p>
                </div>
              ) : (
                <Button className="mt-2" size="sm" variant="ai" loading={code.isPending} onClick={() => code.mutate(undefined, { onError: (e) => push({ title: "Could not create link", message: (e as Error).message, tone: "danger" }) })}>
                  Generate link
                </Button>
              )}
            </div>
          )}
          <div className="rounded-xl border hairline bg-black/15 p-3 text-[11px] leading-relaxed text-muted">
            <p className="font-medium text-ink">Groups</p>
            <p className="mt-1">Add the bot to a school or society group. A group admin sends <code className="text-cyan">/optin</code>; until then every message is ignored. Use <code className="text-cyan">/setlocation</code> to set the area and connect the group on the Community page with the code the bot returns.</p>
            <p className="mt-1 text-faint">{s.privacy_note}</p>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function SettingsPage() {
  const profile = useProfile();
  const update = useUpdateProfile();
  const system = useSystemStatus();
  const setLocation = useApp((s) => s.setLocation);
  const push = useToasts((s) => s.push);
  const [draft, setDraft] = useState<Profile | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [active, setActive] = useState("profile");
  const qc = useQueryClient();

  useEffect(() => {
    if (profile.data) setDraft(profile.data);
  }, [profile.data]);

  const deleteData = useMutation({
    mutationFn: () => del("/api/me/data"),
    onSuccess: () => {
      setConfirmDelete(false);
      void qc.invalidateQueries();
      push({ title: "Your data was deleted", tone: "info" });
    },
  });

  if (profile.isLoading || !draft) return <Skeleton className="h-96" />;
  if (profile.isError) return <ErrorState message={(profile.error as Error).message} />;

  const save = (fields: (keyof Profile)[]) => {
    const body = Object.fromEntries(fields.map((f) => [f, draft[f]])) as Partial<Profile>;
    update.mutate(body, {
      onSuccess: (p) => {
        if (fields.includes("location")) setLocation(p.location, true);
        push({ title: "Settings saved", tone: "success" });
      },
      onError: (e) => push({ title: "Could not save", message: (e as Error).message, tone: "danger" }),
    });
  };
  const exportData = async () => {
    const data = await api<unknown>("/api/me/export");
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "airenv-my-data.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const np = draft.notification_prefs;
  const setNp = (patch: Partial<typeof np>) => setDraft({ ...draft, notification_prefs: { ...np, ...patch } });

  return (
    <div>
      <PageHeader eyebrow="Settings" title="Profile & preferences" description="A one-time setup. AIRenv never asks for daily activity logs." actions={<Badge color={draft.role === "admin" ? "#A78BFA" : "#7CE7B4"}>{draft.role.replace("_", " ")} · {draft.auth_mode} auth</Badge>} />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="hidden lg:block" aria-label="Settings sections">
          <ul className="sticky top-24 space-y-1">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  onClick={() => setActive(s.id)}
                  className={cn("relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm", active === s.id ? "text-ink" : "text-muted hover:text-ink")}
                >
                  {active === s.id && <motion.span layoutId="settings-nav" className="absolute inset-0 rounded-xl bg-emerald/10" />}
                  <s.icon className="relative h-4 w-4" />
                  <span className="relative">{s.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="space-y-5">
          <section id="profile" className="scroll-mt-24 space-y-4">
            <Card hover={false}>
              <CardHeader icon={<MapPin className="h-4 w-4" />} title="Location & community" />
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Display name">
                  <input className="input" value={draft.display_name ?? ""} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })} maxLength={60} />
                </Field>
                <Field label="Language for AI briefings, answers and Telegram" hint="Interface text is in English; AI-generated content follows this setting when Gemini is configured.">
                  <select className="input" value={draft.language} onChange={(e) => setDraft({ ...draft, language: e.target.value })}>
                    {LANGUAGES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={`Monitored location · ${draft.location.name} (${draft.location.lat.toFixed(3)}, ${draft.location.lon.toFixed(3)})`}>
                  <LocationSearch onSelect={(l) => setDraft({ ...draft, location: l })} />
                </Field>
                <Field label="Household / community type">
                  <div className="grid gap-1.5">
                    {COMMUNITY_TYPES.map((t) => (
                      <button key={t.value} onClick={() => setDraft({ ...draft, community_type: t.value })} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs", draft.community_type === t.value ? "border-mint/40 bg-emerald/10" : "hairline hover:bg-white/5")}>
                        <t.icon className="h-3.5 w-3.5 text-mint" /> {t.label}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
              <div className="mt-4 border-t hairline pt-3">
                <p className="mb-1 text-xs font-medium text-muted">Optional family context</p>
                <div className="grid md:grid-cols-2 md:gap-x-6">
                  {FAMILY_FIELDS.map((f) => (
                    <Toggle key={f.key} label={f.label} checked={draft.family_context[f.key]} onChange={(v) => setDraft({ ...draft, family_context: { ...draft.family_context, [f.key]: v } })} />
                  ))}
                </div>
              </div>
              <Button className="mt-3" loading={update.isPending} onClick={() => save(["display_name", "language", "location", "community_type", "family_context"])}>
                Save profile
              </Button>
            </Card>
          </section>

          <section id="notifications" className="scroll-mt-24">
            <Card hover={false}>
              <CardHeader icon={<Bell className="h-4 w-4" />} title="Notification preferences" />
              <div className="grid gap-x-8 md:grid-cols-2">
                <div>
                  <Toggle label="In-app alerts" checked={np.in_app} onChange={(v) => setNp({ in_app: v })} />
                  <Toggle label="Telegram delivery" description={draft.telegram ? "Linked" : "Link Telegram below to receive these"} checked={np.telegram} onChange={(v) => setNp({ telegram: v })} />
                  <Toggle label="Quiet hours" description="Only critical alerts during this window" checked={np.quiet_hours.enabled} onChange={(v) => setNp({ quiet_hours: { ...np.quiet_hours, enabled: v } })} />
                  <div className="grid grid-cols-2 gap-3 py-2">
                    <Field label="From">
                      <input type="time" className="input" value={np.quiet_hours.start} onChange={(e) => setNp({ quiet_hours: { ...np.quiet_hours, start: e.target.value } })} />
                    </Field>
                    <Field label="To">
                      <input type="time" className="input" value={np.quiet_hours.end} onChange={(e) => setNp({ quiet_hours: { ...np.quiet_hours, end: e.target.value } })} />
                    </Field>
                    <Field label="Minimum severity">
                      <select className="input" value={np.min_severity} onChange={(e) => setNp({ min_severity: e.target.value as typeof np.min_severity })}>
                        <option value="info">Everything</option>
                        <option value="low">Low and above</option>
                        <option value="medium">Medium and above</option>
                        <option value="high">High and above</option>
                        <option value="critical">Critical only</option>
                      </select>
                    </Field>
                    <Field label="Daily limit">
                      <input type="number" min={1} max={20} className="input" value={np.daily_limit} onChange={(e) => setNp({ daily_limit: Math.max(1, Math.min(20, Number(e.target.value))) })} />
                    </Field>
                  </div>
                </div>
                <div>
                  <p className="mb-1 mt-2 text-xs font-medium text-muted">Categories</p>
                  {Object.entries(CATEGORY_LABELS).map(([k, l]) => (
                    <Toggle key={k} label={l} checked={np.categories[k] ?? true} onChange={(v) => setNp({ categories: { ...np.categories, [k]: v } })} />
                  ))}
                </div>
              </div>
              <Button className="mt-3" loading={update.isPending} onClick={() => save(["notification_prefs"])}>
                Save notifications
              </Button>
            </Card>
          </section>

          <section id="telegram" className="scroll-mt-24">
            <TelegramSection profile={draft} />
          </section>

          <section id="privacy" className="scroll-mt-24">
            <Card hover={false}>
              <CardHeader icon={<Lock className="h-4 w-4" />} title="Privacy permissions" subtitle="You control what AIRenv processes and keeps" />
              <Toggle label="Allow Conversation Intelligence for my communities" description="Lets AIRenv extract planned activities from groups that also opted in. Raw messages are never stored." checked={draft.privacy.conversation_intelligence} onChange={(v) => setDraft({ ...draft, privacy: { ...draft.privacy, conversation_intelligence: v } })} />
              <Toggle label="Keep extracted event fields" description="Activity type, date and time only, deleted automatically after the retention period." checked={draft.privacy.store_extracted_events} onChange={(v) => setDraft({ ...draft, privacy: { ...draft.privacy, store_extracted_events: v } })} />
              <Toggle label="Include me in aggregate participation counts" checked={draft.privacy.share_aggregate_participation} onChange={(v) => setDraft({ ...draft, privacy: { ...draft.privacy, share_aggregate_participation: v } })} />
              <div className="max-w-xs py-2">
                <Field label="Extracted event retention (days)">
                  <input type="number" min={1} max={90} className="input" value={draft.privacy.event_retention_days} onChange={(e) => setDraft({ ...draft, privacy: { ...draft.privacy, event_retention_days: Math.max(1, Math.min(90, Number(e.target.value))) } })} />
                </Field>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button loading={update.isPending} onClick={() => save(["privacy"])}>
                  Save privacy
                </Button>
                <Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={() => void exportData()}>
                  Export my data
                </Button>
                <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmDelete(true)}>
                  Delete my data
                </Button>
              </div>
            </Card>
          </section>

          <section id="sources" className="scroll-mt-24">
            <Card hover={false}>
              <CardHeader icon={<Database className="h-4 w-4" />} title="Data sources" subtitle="Turn station providers on or off for the air map" />
              <div className="grid gap-x-8 md:grid-cols-2">
                {[
                  ["open_meteo", "Open-Meteo / CAMS model", "Always used for the location time series and forecast"],
                  ["cpcb", "CPCB real-time AQI (data.gov.in)", "Official Indian monitoring stations"],
                  ["openaq", "OpenAQ", "Global aggregated monitor data"],
                  ["sensor_community", "Sensor.Community", "Citizen low-cost sensors (uncalibrated)"],
                ].map(([k, l, d]) => {
                  const integ = system.data?.integrations[k];
                  return (
                    <Toggle
                      key={k}
                      label={
                        <span className="flex items-center gap-2">
                          {l}
                          {integ && (integ.configured ? <Badge color="#35D399">configured</Badge> : <Badge color="#FB923C">needs {integ.env}</Badge>)}
                        </span>
                      }
                      description={d}
                      checked={k === "open_meteo" ? true : draft.data_sources[k] ?? true}
                      disabled={k === "open_meteo"}
                      onChange={(v) => setDraft({ ...draft, data_sources: { ...draft.data_sources, [k]: v } })}
                    />
                  );
                })}
              </div>
              <Button className="mt-3" loading={update.isPending} onClick={() => save(["data_sources"])}>
                Save sources
              </Button>
            </Card>
          </section>

          <section id="system" className="scroll-mt-24">
            <Card hover={false}>
              <CardHeader icon={<Server className="h-4 w-4" />} title="System status" subtitle="Backend integrations and background processing" />
              {system.data ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <ul className="space-y-1.5 text-xs">
                    {Object.entries(system.data.integrations).map(([k, v]) => (
                      <li key={k} className="flex items-center justify-between rounded-lg bg-black/15 px-3 py-2">
                        <span className="flex items-center gap-2 capitalize">
                          {v.configured ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald" /> : <XCircle className="h-3.5 w-3.5 text-faint" />}
                          {k.replace("_", " ")}
                        </span>
                        <span className="font-mono text-[10px] text-faint">{v.configured ? "ready" : v.env}</span>
                      </li>
                    ))}
                  </ul>
                  <ul className="space-y-1.5 text-xs text-muted">
                    <li className="flex justify-between"><span>Storage</span><span className="text-ink">{system.data.storage}</span></li>
                    <li className="flex justify-between"><span>Auth mode</span><span className="text-ink">{system.data.auth_mode}</span></li>
                    <li className="flex justify-between"><span>Scheduler</span><span className="text-ink">{system.data.scheduler.enabled ? `every ${system.data.scheduler.interval_minutes} min` : "disabled"}</span></li>
                    <li className="flex justify-between"><span>Last run</span><span className="text-ink">{timeAgo(system.data.scheduler.last_run_at)}</span></li>
                    <li className="flex justify-between"><span>Runs since start</span><span className="text-ink">{system.data.scheduler.runs}</span></li>
                    <li className="flex justify-between"><span>Live subscribers</span><span className="text-ink">{system.data.live_subscribers}</span></li>
                    {system.data.scheduler.last_errors.length > 0 && <li className="text-orange-300">{system.data.scheduler.last_errors.join("; ")}</li>}
                  </ul>
                </div>
              ) : (
                <Skeleton className="h-32" />
              )}
            </Card>
          </section>
        </div>
      </div>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete your data?">
        <p className="text-sm text-muted">This permanently deletes your profile, preferences and notifications. Communities you administer are not deleted. This cannot be undone.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
          <Button variant="danger" loading={deleteData.isPending} onClick={() => deleteData.mutate()}>
            Delete permanently
          </Button>
        </div>
      </Modal>
    </div>
  );
}
