import { BellRing } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardHeader, Skeleton } from "../../components/ui";
import { ALERT_CATEGORIES, COOLDOWNS, deliveryRules, type AlertCategory } from "../../lib/alerts";
import type { Profile } from "../../lib/types";

export function DeliveryRulesCard({ profile }: { profile: Profile | undefined }) {
  const prefs = profile?.notification_prefs;
  return (
    <Card hover={false}>
      <CardHeader icon={<BellRing aria-hidden="true" className="h-4 w-4" />} title="Your delivery rules" />
      {prefs ? (
        <ul className="space-y-2 text-xs text-muted">
          {deliveryRules(prefs, Boolean(profile?.telegram)).map((r, i) => (
            <li key={r.label} className="flex justify-between">
              <span>{r.label}</span>
              {/* Only the severity value is a bare keyword ("medium") that reads better capitalised. */}
              <span className={i === 0 ? "capitalize text-ink" : "text-ink"}>{r.value}</span>
            </li>
          ))}
        </ul>
      ) : (
        <Skeleton className="h-24" label="Loading delivery rules…" />
      )}
      <Link to="/app/settings" className="mt-3 inline-block text-xs text-cyan hover:underline">
        Change preferences →
      </Link>
    </Card>
  );
}

export function SpamRulesCard() {
  return (
    <Card hover={false}>
      <CardHeader title="How AIRenv avoids spam" />
      <ul className="space-y-1.5 text-[11px] leading-relaxed text-muted">
        <li>· Identical alerts are suppressed for 12 hours (deduplication key per signal).</li>
        <li>· Each category has a cooldown; only an escalation in severity breaks it.</li>
        <li>· Severity priority orders the list: critical → high → medium → low.</li>
      </ul>
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {(Object.entries(COOLDOWNS) as [AlertCategory, string][]).map(([k, v]) => (
          <div key={k} className="rounded-lg bg-black/15 px-2 py-1.5 text-[10px]">
            <span className="text-muted">{ALERT_CATEGORIES[k].label.split(" ")[0]}</span> <span className="float-right text-ink">{v}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
