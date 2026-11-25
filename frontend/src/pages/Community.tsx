import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import {
  BadgeCheck,
  CalendarClock,
  Check,
  CircleDashed,
  Flame,
  FlaskConical,
  Link2,
  MessageSquareText,
  Plus,
  Send,
  ShieldAlert,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LocationSearch } from "../components/LocationPicker";
import { RecommendationCard } from "../components/env";
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Modal, PageHeader, Skeleton, Tabs, Toggle } from "../components/ui";
import { api, del, patch, post } from "../lib/api";
import { AXIS_TICK } from "../components/charts";
import { colorForAqi, colorForPm25, textColorForAqi } from "../lib/aqi";
import { seriesSummary } from "../lib/chartSummary";
import { fmtNum, localDate } from "../lib/format";
import { useBriefing, useCommunities, useCommunityDetail } from "../lib/queries";
import { useApp, useToasts } from "../lib/store";
import type { CommunityDetail, CommunityEvent, Location, Snapshot } from "../lib/types";
import { cn } from "../lib/cn";

const TYPE_LABEL: Record<string, string> = { school: "School", apartment: "Apartment", rwa: "RWA", community_org: "Organisation", workplace: "Workplace" };
const CHART_COLORS = ["#35D399", "#55D6E8", "#A78BFA", "#FACC15", "#FB923C", "#7CE7B4"];

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["communities"] });
    void qc.invalidateQueries({ queryKey: ["community"] });
  };
}

function CreateCommunity({ open, onClose }: { open: boolean; onClose: () => void }) {
  const current = useApp((s) => s.location);
  const [name, setName] = useState("");
  const [type, setType] = useState("school");
  const [loc, setLoc] = useState<Location>(current);
  const invalidate = useInvalidate();
  const push = useToasts((s) => s.push);
  const m = useMutation({
    mutationFn: () => post("/api/communities", { name, type, location: loc }),
    onSuccess: () => {
      invalidate();
      push({ title: "Community created", tone: "success" });
      onClose();
    },
    onError: (e) => push({ title: "Could not create community", message: (e as Error).message, tone: "danger" }),
  });
  return (
    <Modal open={open} onClose={onClose} title="Create a community">
      <div className="space-y-4">
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sunrise Public School" maxLength={80} />
        </Field>
        <Field label="Type">
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(TYPE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Location · ${loc.name}`} group>
          <LocationSearch onSelect={setLoc} />
        </Field>
        <Button className="w-full" disabled={name.trim().length < 2} loading={m.isPending} onClick={() => m.mutate()}>
          Create community
        </Button>
      </div>
    </Modal>
  );
}

function RiskBadge({ ev }: { ev: CommunityEvent }) {
  const r = ev.risk;
  if (!r) return <Badge color="#94A89D">not assessed</Badge>;
  if (r.level === "unknown") return <Badge color="#94A89D">outside forecast range</Badge>;
  const color = r.sub_index != null ? textColorForAqi(r.sub_index) : "#94A89D";
  return (
    <Badge color={color} dot>
      {r.category_label ?? r.level} · PM2.5 ~{fmtNum(r.forecast_pm2_5)}
    </Badge>
  );
}

function EventRow({ ev, cid, canManage }: { ev: CommunityEvent; cid: string; canManage: boolean }) {
  const invalidate = useInvalidate();
  const push = useToasts((s) => s.push);
  const [text, setText] = useState(ev.advisory?.text ?? "");
  const [editing, setEditing] = useState(false);
  const decide = useMutation({
    mutationFn: (action: "approve" | "dismiss") => post<CommunityEvent>(`/api/communities/${cid}/events/${ev.id}/advisory`, { action, text }),
    onSuccess: (res, action) => {
      invalidate();
      const errs = res.advisory?.delivery_errors ?? [];
      push({
        title: action === "approve" ? (res.advisory?.status === "sent" ? "Advisory sent to Telegram" : "Advisory approved") : "Advisory dismissed",
        message: errs.length ? errs.join("; ") : undefined,
        tone: action === "approve" ? "success" : "info",
      });
    },
    onError: (e) => push({ title: "Action failed", message: (e as Error).message, tone: "danger" }),
  });
  const remove = useMutation({ mutationFn: () => del(`/api/communities/${cid}/events/${ev.id}`), onSuccess: invalidate });
  const status = ev.advisory?.status ?? "none";
  return (
    <motion.li layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border hairline bg-black/15 p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {ev.title} {ev.is_demo && <Badge color="#A78BFA">demo</Badge>}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            {ev.date ? localDate(ev.date) : "date unknown"} · {ev.time ?? "time not stated"}
            {ev.time_precision && ev.time_precision !== "exact" && ev.time ? ` (${ev.time_precision.replace("_", " ")})` : ""} · {ev.outdoor === false ? "indoor" : "outdoor"} · {ev.intensity} intensity · via {ev.source === "telegram" ? `Telegram${ev.group_title ? ` (${ev.group_title})` : ""}` : "manual entry"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RiskBadge ev={ev} />
          {canManage && (
            <button type="button" onClick={() => remove.mutate()} className="rounded-lg p-1.5 text-faint hover:bg-white/5 hover:text-red-300" aria-label={`Delete activity: ${ev.title}`}>
              <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {ev.risk?.summary && <p className="mt-2 text-xs leading-relaxed text-muted">{ev.risk.summary}</p>}
      {ev.risk?.best_alternative && (
        <p className="mt-1 text-xs text-mint">
          Cleaner window: {ev.risk.best_alternative.start.slice(11, 16)} (~{fmtNum(ev.risk.best_alternative.mean_pm2_5)} µg/m³)
        </p>
      )}
      {status === "pending" && (
        <div className="mt-3 rounded-xl border border-cyan/25 bg-cyan/5 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-cyan">
            <ShieldAlert aria-hidden="true" className="h-3.5 w-3.5" /> Advisory awaiting human approval
          </p>
          {editing ? (
            <textarea aria-label={`Advisory text for ${ev.title}`} className="input mt-2 min-h-24 text-xs" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
          ) : (
            <p className="mt-1.5 text-xs leading-relaxed text-ink/85">{text}</p>
          )}
          {canManage && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Button size="sm" icon={<Send aria-hidden="true" className="h-3.5 w-3.5" />} loading={decide.isPending && decide.variables === "approve"} onClick={() => decide.mutate("approve")}>
                Approve & send
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(!editing)}>
                {editing ? "Done editing" : "Edit"}
              </Button>
              <Button size="sm" variant="ghost" icon={<X aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => decide.mutate("dismiss")}>
                Dismiss
              </Button>
            </div>
          )}
        </div>
      )}
      {status === "sent" && <p className="mt-2 text-[11px] text-emerald">✓ Advisory posted to the group</p>}
      {status === "approved" && <p className="mt-2 text-[11px] text-muted">Approved. No live Telegram group was available to deliver it.</p>}
      {status === "dismissed" && <p className="mt-2 text-[11px] text-faint">Advisory dismissed by an administrator.</p>}
    </motion.li>
  );
}

function AddEvent({ cid, open, onClose }: { cid: string; open: boolean; onClose: () => void }) {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const [f, setF] = useState({ title: "", activity_type: "sports", intensity: "high", outdoor: true, date: tomorrow, time: "15:00", duration_hours: 2 });
  const invalidate = useInvalidate();
  const push = useToasts((s) => s.push);
  const m = useMutation({
    mutationFn: () => post<CommunityEvent>(`/api/communities/${cid}/events`, f),
    onSuccess: (ev) => {
      invalidate();
      onClose();
      push({ title: "Activity added", message: ev.risk?.summary, tone: ev.risk?.respond ? "warning" : "success" });
    },
    onError: (e) => push({ title: "Could not add activity", message: (e as Error).message, tone: "danger" }),
  });
  return (
    <Modal open={open} onClose={onClose} title="Add an upcoming activity">
      <div className="space-y-3">
        <Field label="Title">
          <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Annual sports day" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
          <Field label="Start time">
            <input type="time" className="input" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
          </Field>
          <Field label="Intensity">
            <select className="input" value={f.intensity} onChange={(e) => setF({ ...f, intensity: e.target.value })}>
              <option value="sedentary">Sedentary</option>
              <option value="light">Light</option>
              <option value="moderate">Moderate</option>
              <option value="high">High (sports, running)</option>
            </select>
          </Field>
          <Field label="Duration (hours)">
            <input type="number" min={1} max={8} className="input" value={f.duration_hours} onChange={(e) => setF({ ...f, duration_hours: Number(e.target.value) })} />
          </Field>
        </div>
        <Toggle label="Outdoor activity" checked={f.outdoor} onChange={(v) => setF({ ...f, outdoor: v })} />
        <p className="text-[11px] text-faint">AIRenv checks the forecast for this time immediately and re-checks it on every scheduled refresh.</p>
        <Button className="w-full" disabled={f.title.trim().length < 2} loading={m.isPending} onClick={() => m.mutate()}>
          Add & assess
        </Button>
      </div>
    </Modal>
  );
}

function Initiatives({ detail }: { detail: CommunityDetail }) {
  const cid = detail.community.id;
  const can = detail.community.can_manage;
  const invalidate = useInvalidate();
  const push = useToasts((s) => s.push);
  const [addIni, setAddIni] = useState(false);
  const [recFor, setRecFor] = useState<string | null>(null);
  const [ini, setIni] = useState({ type: "carpool", title: "", description: "" });
  const [rec, setRec] = useState({ date: new Date().toISOString().slice(0, 10), participants: 10, quantity: 0, km_shifted: 0, evidence_note: "", verified: false });
  const createIni = useMutation({
    mutationFn: () => post(`/api/communities/${cid}/initiatives`, ini),
    onSuccess: () => {
      invalidate();
      setAddIni(false);
    },
    onError: (e) => push({ title: "Could not add initiative", message: (e as Error).message, tone: "danger" }),
  });
  const createRec = useMutation({
    mutationFn: () => {
      const type = detail.initiatives.find((i) => i.id === recFor)?.type;
      const body = { ...rec, km_shifted: rec.km_shifted || null, ...(type === "carpool" ? { baseline_mode: "petrol_car", alternative_mode: "petrol_car", occupants: 3 } : {}), ...(type === "public_transport" ? { baseline_mode: "petrol_car", alternative_mode: "metro", occupants: 1 } : {}) };
      return post(`/api/communities/${cid}/initiatives/${recFor}/records`, body);
    },
    onSuccess: () => {
      invalidate();
      setRecFor(null);
    },
    onError: (e) => push({ title: "Could not add record", message: (e as Error).message, tone: "danger" }),
  });
  const verify = useMutation({ mutationFn: (rid: string) => post(`/api/communities/${cid}/records/${rid}/verify`), onSuccess: invalidate });

  return (
    <Card hover={false} className="lg:col-span-2">
      <CardHeader
        icon={<BadgeCheck aria-hidden="true" className="h-4 w-4" />}
        title="Sustainable initiatives"
        subtitle="Only administrator-verified records count toward statistics"
        action={can && <Button size="sm" variant="outline" icon={<Plus aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => setAddIni(true)}>Initiative</Button>}
      />
      {detail.initiatives.length === 0 ? (
        <EmptyState title="No initiatives yet" description="Track carpools, public-transport weeks, waste segregation or no-burn drives. Add records when they happen; there's no daily logging." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {detail.initiatives.map((i) => (
            <div key={i.id} className="rounded-xl border hairline bg-black/15 p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{i.title}</p>
                  <p className="text-[11px] text-muted">{i.label}</p>
                </div>
                {can && (
                  <Button size="sm" variant="ghost" icon={<Plus aria-hidden="true" className="h-3 w-3" />} onClick={() => setRecFor(i.id)}>
                    Record
                  </Button>
                )}
              </div>
              <ul className="mt-2 space-y-1">
                {i.records.slice(0, 4).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-muted">
                      {r.date} · {r.participants} participants{r.km_shifted ? ` · ${r.km_shifted} km` : ""}
                    </span>
                    {r.verified ? (
                      <span className="flex items-center gap-1 text-emerald">
                        <Check aria-hidden="true" className="h-3 w-3" /> verified
                      </span>
                    ) : can ? (
                      <button type="button" onClick={() => verify.mutate(r.id)} aria-label={`Verify record from ${r.date} (${r.participants} participants)`} className="flex items-center gap-1 py-0.5 text-yellow-300 hover:underline">
                        <CircleDashed aria-hidden="true" className="h-3 w-3" /> verify
                      </button>
                    ) : (
                      <span className="text-yellow-300">pending</span>
                    )}
                  </li>
                ))}
                {i.records.length === 0 && <li className="text-[11px] text-faint">No records yet.</li>}
              </ul>
            </div>
          ))}
        </div>
      )}
      <Modal open={addIni} onClose={() => setAddIni(false)} title="New initiative">
        <div className="space-y-3">
          <Field label="Type">
            <select className="input" value={ini.type} onChange={(e) => setIni({ ...ini, type: e.target.value })}>
              {Object.entries(detail.initiative_types).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Title">
            <input className="input" value={ini.title} onChange={(e) => setIni({ ...ini, title: e.target.value })} />
          </Field>
          <Field label="Description">
            <textarea className="input" value={ini.description} onChange={(e) => setIni({ ...ini, description: e.target.value })} maxLength={400} />
          </Field>
          <Button className="w-full" disabled={ini.title.trim().length < 2} loading={createIni.isPending} onClick={() => createIni.mutate()}>
            Create
          </Button>
        </div>
      </Modal>
      <Modal open={Boolean(recFor)} onClose={() => setRecFor(null)} title="Add a participation record">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <input type="date" className="input" value={rec.date} onChange={(e) => setRec({ ...rec, date: e.target.value })} />
            </Field>
            <Field label="Participants">
              <input type="number" min={0} className="input" value={rec.participants} onChange={(e) => setRec({ ...rec, participants: Number(e.target.value) })} />
            </Field>
            <Field label="Quantity (unit of initiative)">
              <input type="number" min={0} className="input" value={rec.quantity} onChange={(e) => setRec({ ...rec, quantity: Number(e.target.value) })} />
            </Field>
            <Field label="Distance shifted (km, transport only)">
              <input type="number" min={0} className="input" value={rec.km_shifted} onChange={(e) => setRec({ ...rec, km_shifted: Number(e.target.value) })} />
            </Field>
          </div>
          <Field label="Evidence note" hint="e.g. sign-up sheet, collection receipt. Avoid personal details.">
            <input className="input" value={rec.evidence_note} onChange={(e) => setRec({ ...rec, evidence_note: e.target.value })} maxLength={300} />
          </Field>
          <Toggle label="I have verified this record" checked={rec.verified} onChange={(v) => setRec({ ...rec, verified: v })} />
          <Button className="w-full" loading={createRec.isPending} onClick={() => createRec.mutate()}>
            Save record
          </Button>
        </div>
      </Modal>
    </Card>
  );
}

function Groups({ detail }: { detail: CommunityDetail }) {
  const cid = detail.community.id;
  const can = detail.community.can_manage;
  const invalidate = useInvalidate();
  const push = useToasts((s) => s.push);
  const [code, setCode] = useState("");
  const connect = useMutation({
    mutationFn: () => post<{ group: string }>(`/api/communities/${cid}/groups/connect`, { code }),
    onSuccess: (r) => {
      invalidate();
      setCode("");
      push({ title: `Connected ${r.group}`, tone: "success" });
    },
    onError: (e) => push({ title: "Could not connect group", message: (e as Error).message, tone: "danger" }),
  });
  const update = useMutation({
    mutationFn: ({ gid, body }: { gid: string; body: Record<string, unknown> }) => patch(`/api/communities/${cid}/groups/${gid}`, body),
    onSuccess: invalidate,
    onError: (e) => push({ title: "Update failed", message: (e as Error).message, tone: "danger" }),
  });
  return (
    <Card hover={false}>
      <CardHeader icon={<Users aria-hidden="true" className="h-4 w-4" />} title="Participating groups" subtitle="Telegram groups opted in by their administrators" />
      {detail.groups.length === 0 ? (
        <p className="mb-3 text-xs text-muted">No groups connected. Add the AIRenv bot to a Telegram group, have a group admin send <code className="text-cyan">/optin</code>, then enter the code it returns.</p>
      ) : (
        <ul className="mb-3 space-y-2">
          {detail.groups.map((g) => (
            <li key={g.id} className="rounded-xl border hairline bg-black/15 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {g.title} {g.is_demo && <Badge color="#A78BFA">demo</Badge>}
                </span>
                <Badge color={g.authorized ? "#35D399" : "#94A89D"} dot>
                  {g.authorized ? "opted in" : "not opted in"}
                </Badge>
              </div>
              {can && g.authorized && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <Tabs label={`Reply mode for ${g.title}`} layoutId={`mode-${g.id}`} value={g.reply_mode} onChange={(v) => update.mutate({ gid: g.id, body: { reply_mode: v } })} tabs={[{ value: "approval", label: "Admin approval" }, { value: "auto", label: "Auto-reply" }]} />
                  <button type="button" onClick={() => update.mutate({ gid: g.id, body: { authorized: false } })} className="py-1 text-faint hover:text-red-300">
                    Revoke & delete extracted events
                  </button>
                </div>
              )}
              {can && !g.authorized && g.is_demo && (
                <button type="button" onClick={() => update.mutate({ gid: g.id, body: { authorized: true } })} className="mt-2 py-1 text-xs text-cyan hover:underline">
                  Simulate group opt-in (demo)
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {can && (
        <div className="flex gap-2">
          <input className="input" aria-label="Group connect code" placeholder="Group connect code" value={code} onChange={(e) => setCode(e.target.value)} />
          <Button variant="outline" icon={<Link2 aria-hidden="true" className="h-4 w-4" />} disabled={code.length < 4} loading={connect.isPending} onClick={() => connect.mutate()}>
            Connect
          </Button>
        </div>
      )}
    </Card>
  );
}

function ConversationTester({ community }: { community: CommunityDetail["community"] }) {
  const [text, setText] = useState("Tomorrow we are conducting outdoor sports activities at 3 PM.");
  type Result = { relevant: boolean; respond: boolean; advisory: string | null; event: Record<string, unknown> | null; risk: CommunityEvent["risk"]; privacy: string };
  const m = useMutation({
    mutationFn: () => post<Result>("/api/conversation/analyze", { text, lat: community.location.lat, lon: community.location.lon, audience: community.type === "school" ? "school" : "general" }),
  });
  const shown = ["kind", "activity_type", "concern_type", "date", "time", "outdoor", "intensity"];
  return (
    <Card hover={false}>
      <CardHeader icon={<MessageSquareText aria-hidden="true" className="h-4 w-4 text-cyan" />} title="Conversation Intelligence test" subtitle="See what AIRenv would extract from a group message. Nothing is stored." />
      <textarea aria-label="Group message to analyse" className="input min-h-20 text-sm" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {["Let's burn the dry leaves near the gate on Sunday", "Cricket practice on Saturday 7 am in the ground", "Happy birthday Riya!"].map((s) => (
          <button type="button" key={s} onClick={() => setText(s)} aria-label={`Use example message: ${s}`} className="rounded-full border hairline px-2.5 py-0.5 text-[11px] text-muted hover:text-ink">
            {s}
          </button>
        ))}
      </div>
      <Button className="mt-3" variant="ai" size="sm" loading={m.isPending} disabled={text.trim().length < 3} onClick={() => m.mutate()}>
        Analyse message
      </Button>
      {m.isError && <p role="alert" className="mt-2 text-xs text-orange-300">{(m.error as Error).message}</p>}
      <div aria-live="polite">
      {m.data && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-3 space-y-2 text-xs">
          {!m.data.relevant ? (
            <p className="rounded-xl border hairline bg-black/15 p-3 text-muted">Not environmentally relevant. AIRenv would ignore this message and not reply.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {shown
                  .filter((k) => m.data!.event?.[k] != null)
                  .map((k) => (
                    <span key={k} className="rounded-md border hairline bg-white/[0.02] px-2 py-1 font-mono text-[10px]">
                      {k}: <span className="text-cyan">{String(m.data!.event![k])}</span>
                    </span>
                  ))}
              </div>
              {m.data.risk?.summary && <p className="text-muted">{m.data.risk.summary}</p>}
              <p className={m.data.respond ? "text-yellow-300" : "text-emerald"}>{m.data.respond ? "A reply is warranted. Draft advisory:" : "No reply needed: conditions don't warrant one."}</p>
              {m.data.advisory && <p className="rounded-xl border border-cyan/20 bg-cyan/5 p-3 leading-relaxed">{m.data.advisory}</p>}
            </>
          )}
          <p className="text-[10px] text-faint">{m.data.privacy}</p>
        </motion.div>
      )}
      </div>
    </Card>
  );
}

function OverviewStrip({ detail }: { detail: CommunityDetail }) {
  const loc = detail.community.location;
  const snap = useQuery({
    queryKey: ["community-air", loc.lat, loc.lon],
    queryFn: () => api<Snapshot>(`/api/air/current?lat=${loc.lat}&lon=${loc.lon}&name=${encodeURIComponent(loc.name)}`),
    staleTime: 5 * 60_000,
  });
  const pending = detail.events.filter((e) => e.advisory?.status === "pending").length;
  const atRisk = detail.events.filter((e) => e.risk?.respond).length;
  const concerns = detail.events.filter((e) => e.kind === "concern").length;
  const s = snap.data;
  const items = [
    { l: "Current NAQI", v: s ? s.aqi.value : null, sub: s ? `${s.aqi.category?.label} · ${loc.name}` : "loading", c: s ? colorForAqi(s.aqi.value) : undefined },
    { l: "PM2.5 now", v: s ? s.pollutants.pm2_5.value : null, sub: "µg/m³ · model estimate", c: s ? colorForPm25(s.pollutants.pm2_5.value) : undefined },
    { l: "Activities at risk", v: atRisk, sub: `${pending} advisory${pending === 1 ? "" : "ies"} awaiting approval`, c: atRisk ? "#FB923C" : "#35D399" },
    { l: "Verified participants", v: detail.stats.totals.verified_participants, sub: `${detail.stats.totals.pending_records} record${detail.stats.totals.pending_records === 1 ? "" : "s"} pending verification`, c: "#55D6E8" },
    { l: "Environmental concerns", v: concerns, sub: "e.g. open burning discussed", c: concerns ? "#FACC15" : "#35D399" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {items.map((it, i) => (
        <motion.div key={it.l} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="glass rounded-2xl p-4">
          <p className="text-[11px] text-muted">{it.l}</p>
          <p className="mt-1 font-display text-2xl font-semibold" style={{ color: it.c }}>
            {it.v == null ? "—" : fmtNum(it.v)}
          </p>
          <p className="mt-0.5 text-[10px] text-faint">{it.sub}</p>
        </motion.div>
      ))}
    </div>
  );
}

export default function Community() {
  const list = useCommunities();
  const location = useApp((s) => s.location);
  const [selected, setSelected] = useState<string | null>(null);
  const [create, setCreate] = useState(false);
  const [addEvent, setAddEvent] = useState(false);
  const detail = useCommunityDetail(selected);
  const invalidate = useInvalidate();
  const push = useToasts((s) => s.push);
  const briefing = useBriefing();
  const seed = useMutation({
    mutationFn: () => post(`/api/communities/demo/seed?lat=${location.lat}&lon=${location.lon}&name=${encodeURIComponent(location.name)}`),
    onSuccess: () => {
      invalidate();
      push({ title: "Demo communities loaded", message: "Clearly labelled sample communities, assessed against the real forecast.", tone: "ai" });
    },
  });
  const unseed = useMutation({ mutationFn: () => del("/api/communities/demo"), onSuccess: () => { setSelected(null); invalidate(); } });

  useEffect(() => {
    const cs = list.data?.communities ?? [];
    if (cs.length && (!selected || !cs.some((c) => c.id === selected))) setSelected(cs[0].id);
  }, [list.data, selected]);

  const communities = list.data?.communities ?? [];
  const hasDemo = communities.some((c) => c.is_demo);
  const d = detail.data;
  const upcoming = d?.events.filter((e) => e.kind === "activity") ?? [];
  const concerns = d?.events.filter((e) => e.kind === "concern") ?? [];
  const types = d ? Array.from(new Set(d.stats.monthly_verified_participation.flatMap((r) => Object.keys(r).filter((k) => k !== "month")))) : [];
  const commRecs = (briefing.data?.recommendations ?? []).filter((r) => ["communities", "schools"].includes(r.audience) || r.category === "community_event");

  return (
    <div>
      <PageHeader
        eyebrow="Community intelligence"
        title="Protect the people you organise"
        description="Schools, apartments and associations: see upcoming activities checked against the forecast, approve advisories, and track verified initiatives."
        actions={
          <>
            {hasDemo ? (
              <Button variant="ghost" size="sm" icon={<Trash2 aria-hidden="true" className="h-3.5 w-3.5" />} loading={unseed.isPending} onClick={() => unseed.mutate()}>
                Remove demo data
              </Button>
            ) : (
              <Button variant="outline" size="sm" icon={<FlaskConical aria-hidden="true" className="h-3.5 w-3.5" />} loading={seed.isPending} onClick={() => seed.mutate()}>
                Load demo communities
              </Button>
            )}
            <Button size="sm" icon={<Plus aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => setCreate(true)}>
              New community
            </Button>
          </>
        }
      />
      <CreateCommunity open={create} onClose={() => setCreate(false)} />

      {list.isLoading ? (
        <Skeleton className="h-64" label="Loading communities…" />
      ) : list.isError ? (
        <ErrorState message={(list.error as Error).message} />
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
          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Choose a community">
            {communities.map((c) => (
              <button type="button" key={c.id} aria-pressed={selected === c.id} onClick={() => setSelected(c.id)} className={cn("relative rounded-xl border px-3.5 py-2 text-left text-sm transition-colors", selected === c.id ? "border-mint/30 bg-emerald/10" : "hairline bg-black/15 hover:bg-white/5")}>
                <span className="font-medium">{c.name}</span>
                <span className="ml-2 text-[11px] text-muted">{TYPE_LABEL[c.type] ?? c.type}</span>
                {(c.pending_advisories ?? 0) > 0 && <span className="ml-2 rounded-full bg-cyan/20 px-1.5 text-[10px] text-cyan">{c.pending_advisories} pending</span>}
              </button>
            ))}
          </div>

          {detail.isLoading || !d ? (
            <Skeleton className="h-96" label="Loading community details…" />
          ) : (
            <div className="space-y-4">
              {d.community.is_demo && (
                <div className="flex items-center gap-2 rounded-xl border border-violet/30 bg-violet/10 px-4 py-2 text-xs text-violet-100">
                  <FlaskConical aria-hidden="true" className="h-4 w-4 shrink-0 text-violet" /> Demo community. Events and initiatives are samples; their risk assessments use the real forecast.
                </div>
              )}
              <OverviewStrip detail={d} />
              <div className="grid gap-4 lg:grid-cols-3">
                <Card hover={false} className="lg:col-span-2">
                  <CardHeader
                    icon={<CalendarClock aria-hidden="true" className="h-4 w-4" />}
                    title="Upcoming activities & alerts"
                    subtitle="From connected groups or added manually. Re-assessed on every refresh."
                    action={d.community.can_manage && <Button size="sm" variant="outline" icon={<Plus aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => setAddEvent(true)}>Activity</Button>}
                  />
                  {upcoming.length === 0 ? (
                    <EmptyState title="No upcoming activities" description="Activities announced in opted-in Telegram groups appear here automatically." />
                  ) : (
                    <ul className="space-y-2.5">
                      {upcoming.map((ev) => (
                        <EventRow key={ev.id} ev={ev} cid={d.community.id} canManage={d.community.can_manage} />
                      ))}
                    </ul>
                  )}
                </Card>
                <div className="space-y-4">
                  <Card hover={false}>
                    <CardHeader icon={<Flame aria-hidden="true" className="h-4 w-4 text-orange-300" />} title="Environmental concerns" />
                    {concerns.length === 0 ? (
                      <p className="text-xs text-muted">No concerns detected. AIRenv flags open-burning discussions in opted-in groups.</p>
                    ) : (
                      <ul className="space-y-2">
                        {concerns.map((c) => (
                          <li key={c.id} className="rounded-xl border border-orange-400/20 bg-orange-400/5 p-3 text-xs">
                            <p className="font-medium">{c.title}</p>
                            <p className="mt-1 text-muted">{c.advisory?.text ?? "Safer alternatives: segregate waste for municipal collection; compost leaves."}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                  <Groups detail={d} />
                </div>

                <Initiatives detail={d} />
                <Card hover={false}>
                  <CardHeader title="Participation statistics" subtitle="Verified participants per month" />
                  {d.stats.monthly_verified_participation.length === 0 ? (
                    <EmptyState title="No verified participation yet" />
                  ) : (
                    <div className="h-52" role="img" aria-label={seriesSummary("Verified participants per month", d.stats.monthly_verified_participation.map((r) => ({ label: String(r.month), value: types.reduce((sum, t) => sum + (Number(r[t]) || 0), 0) })), "participants")}>
                      <ResponsiveContainer>
                        <BarChart data={d.stats.monthly_verified_participation} margin={{ left: -20, right: 4, top: 8 }}>
                          <CartesianGrid stroke="rgba(124,231,180,0.06)" vertical={false} />
                          <XAxis dataKey="month" tick={{ fill: AXIS_TICK, fontSize: 10 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: AXIS_TICK, fontSize: 10 }} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={{ background: "#10231B", border: "1px solid rgba(124,231,180,0.15)", borderRadius: 12, fontSize: 12 }} />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          {types.map((t, i) => (
                            <Bar key={t} dataKey={t} stackId="a" fill={CHART_COLORS[i % CHART_COLORS.length]} radius={i === types.length - 1 ? [6, 6, 0, 0] : 0} />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  <p className="mt-2 text-[11px] leading-relaxed text-faint">{d.stats.disclaimer}</p>
                </Card>

                <div className="space-y-2 lg:col-span-2">
                  <h2 className="label">Community recommendations</h2>
                  {commRecs.length === 0 ? (
                    <Card hover={false}>
                      <p className="text-xs text-muted">No community-specific recommendations for current conditions.</p>
                    </Card>
                  ) : (
                    commRecs.map((r, i) => <RecommendationCard key={r.id} rec={r} index={i} />)
                  )}
                </div>
                <ConversationTester community={d.community} />
              </div>
              <AddEvent cid={d.community.id} open={addEvent} onClose={() => setAddEvent(false)} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
