import { Bell } from "lucide-react";
import { Button, Card, CardHeader, Field, Toggle } from "../../components/ui";
import { clampInt } from "../../lib/settings";
import type { NotificationPrefs } from "../../lib/types";
import { CATEGORY_LABELS, SEVERITY_OPTIONS } from "./constants";
import type { SectionProps } from "./hooks";

export function NotificationsCard({ draft, setDraft, saving, save }: SectionProps) {
  const np = draft.notification_prefs;
  const setNp = (patch: Partial<NotificationPrefs>) => setDraft({ ...draft, notification_prefs: { ...np, ...patch } });
  const setQuiet = (patch: Partial<NotificationPrefs["quiet_hours"]>) => setNp({ quiet_hours: { ...np.quiet_hours, ...patch } });
  return (
    <Card hover={false}>
      <CardHeader icon={<Bell aria-hidden="true" className="h-4 w-4" />} title="Notification preferences" />
      <div className="grid gap-x-8 md:grid-cols-2">
        <div>
          <Toggle label="In-app alerts" checked={np.in_app} onChange={(v) => setNp({ in_app: v })} />
          <Toggle
            label="Telegram delivery"
            description={draft.telegram ? "Linked" : "Link Telegram below to receive these"}
            checked={np.telegram}
            onChange={(v) => setNp({ telegram: v })}
          />
          <Toggle
            label="Quiet hours"
            description="Only critical alerts during this window"
            checked={np.quiet_hours.enabled}
            onChange={(v) => setQuiet({ enabled: v })}
          />
          <div className="grid grid-cols-2 gap-3 py-2">
            <Field label="From">
              <input type="time" className="input" value={np.quiet_hours.start} onChange={(e) => setQuiet({ start: e.target.value })} />
            </Field>
            <Field label="To">
              <input type="time" className="input" value={np.quiet_hours.end} onChange={(e) => setQuiet({ end: e.target.value })} />
            </Field>
            <Field label="Minimum severity">
              <select
                className="input"
                value={np.min_severity}
                onChange={(e) => setNp({ min_severity: e.target.value as NotificationPrefs["min_severity"] })}
              >
                {SEVERITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Daily limit">
              <input
                type="number"
                min={1}
                max={20}
                className="input"
                value={np.daily_limit}
                onChange={(e) => setNp({ daily_limit: clampInt(Number(e.target.value), 1, 20) })}
              />
            </Field>
          </div>
        </div>
        <div>
          <p className="mb-1 mt-2 text-xs font-medium text-muted">Categories</p>
          {Object.entries(CATEGORY_LABELS).map(([k, l]) => (
            <Toggle
              key={k}
              label={l}
              checked={np.categories[k] ?? true}
              onChange={(v) => setNp({ categories: { ...np.categories, [k]: v } })}
            />
          ))}
        </div>
      </div>
      <Button className="mt-3" loading={saving} onClick={() => save(["notification_prefs"])}>
        Save notifications
      </Button>
    </Card>
  );
}
