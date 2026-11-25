import { AnimatePresence, motion } from "motion/react";
import { Bell, Check, MapPin } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { cn } from "../lib/cn";
import { COMMUNITY_TYPES, FAMILY_FIELDS } from "../lib/profileOptions";
import { useUpdateProfile } from "../lib/queries";
import { useApp } from "../lib/store";
import type { FamilyContext, Location, Profile } from "../lib/types";
import { LocationSearch } from "./LocationPicker";
import { Button, Modal, Toggle } from "./ui";

export function Onboarding({ profile }: { profile: Profile }) {
  const [step, setStep] = useState(0);
  const [location, setLoc] = useState<Location>(profile.location);
  const [ctype, setCtype] = useState(profile.community_type);
  const [family, setFamily] = useState<FamilyContext>(profile.family_context);
  const [prefs, setPrefs] = useState(profile.notification_prefs);
  const update = useUpdateProfile();
  const setLocation = useApp((s) => s.setLocation);
  const [open, setOpen] = useState(true);
  // After the user moves between steps, focus the new step heading so keyboard and
  // screen-reader users don't lose their place when buttons appear or disappear.
  const navigated = useRef(false);
  const focusHeading = useCallback((el: HTMLHeadingElement | null) => {
    if (el && navigated.current) el.focus();
  }, []);
  const go = (next: number) => {
    navigated.current = true;
    setStep(next);
  };

  const finish = (skip = false) => {
    const body: Partial<Profile> = skip ? { onboarded: true } : { onboarded: true, location, community_type: ctype, family_context: family, notification_prefs: prefs };
    update.mutate(body, {
      onSuccess: () => {
        if (!skip) setLocation(location, true);
        setOpen(false);
      },
    });
  };

  const steps = [
    {
      title: "Where should AIRenv watch the air?",
      body: (
        <div>
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-mint/20 bg-emerald/5 px-3 py-2 text-sm">
            <MapPin aria-hidden="true" className="h-4 w-4 text-mint" /> <span className="sr-only">Selected location:</span> {location.name}{" "}
            <span className="text-xs text-faint">
              ({location.lat.toFixed(2)}, {location.lon.toFixed(2)})
            </span>
          </div>
          <LocationSearch onSelect={setLoc} />
        </div>
      ),
    },
    {
      title: "Who are you planning for?",
      body: (
        <div className="grid gap-2 sm:grid-cols-2">
          {COMMUNITY_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              aria-pressed={ctype === t.value}
              onClick={() => setCtype(t.value)}
              className={cn("flex items-center gap-3 rounded-xl border p-3 text-left text-sm transition-colors", ctype === t.value ? "border-mint/40 bg-emerald/10" : "hairline hover:bg-white/5")}
            >
              <t.icon aria-hidden="true" className="h-4 w-4 text-mint" />
              {t.label}
              {ctype === t.value && <Check aria-hidden="true" className="ml-auto h-4 w-4 text-mint" />}
            </button>
          ))}
        </div>
      ),
    },
    {
      title: "Anyone who needs extra care? (optional)",
      body: (
        <div>
          <p className="mb-2 text-xs text-muted">Used only to tune recommendations and alert thresholds. No medical details are collected.</p>
          {FAMILY_FIELDS.map((f) => (
            <Toggle key={f.key} label={f.label} checked={family[f.key]} onChange={(v) => setFamily({ ...family, [f.key]: v })} />
          ))}
        </div>
      ),
    },
    {
      title: "How should we reach you?",
      body: (
        <div>
          <Toggle label="In-app alerts" description="Real-time alerts in this dashboard." checked={prefs.in_app} onChange={(v) => setPrefs({ ...prefs, in_app: v })} />
          <Toggle
            label="Quiet hours (22:00–07:00)"
            description="Only critical alerts during the night."
            checked={prefs.quiet_hours.enabled}
            onChange={(v) => setPrefs({ ...prefs, quiet_hours: { ...prefs.quiet_hours, enabled: v } })}
          />
          <div className="mt-3 flex items-center gap-2 rounded-xl border hairline bg-black/20 p-3 text-xs text-muted">
            <Bell aria-hidden="true" className="h-4 w-4 text-cyan" /> Connect Telegram later in Settings to receive alerts without opening AIRenv.
          </div>
        </div>
      ),
    },
  ];

  return (
    <Modal
      open={open}
      onClose={() => finish(true)}
      title={
        <span>
          Welcome to AIR<span className="text-mint">env</span>
        </span>
      }
      wide
    >
      <p className="sr-only" aria-live="polite">
        Step {step + 1} of {steps.length}
      </p>
      <div className="mb-5 flex gap-1.5" aria-hidden="true">
        {steps.map((_, i) => (
          <motion.span key={i} className="h-1 flex-1 rounded-full" animate={{ background: i <= step ? "#35D399" : "rgba(124,231,180,0.12)" }} />
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>
          <h3 ref={focusHeading} tabIndex={-1} className="mb-4 font-display text-base font-semibold">
            {steps[step].title}
          </h3>
          {steps[step].body}
        </motion.div>
      </AnimatePresence>
      <div className="mt-6 flex items-center justify-between">
        <button type="button" onClick={() => finish(true)} className="py-1 text-xs text-muted hover:text-ink">
          Skip setup
        </button>
        <div className="flex gap-2">
          {step > 0 && (
            <Button variant="ghost" onClick={() => go(step - 1)}>
              Back
            </Button>
          )}
          {step < steps.length - 1 ? (
            <Button onClick={() => go(step + 1)}>Continue</Button>
          ) : (
            <Button onClick={() => finish(false)} loading={update.isPending}>
              Start monitoring
            </Button>
          )}
        </div>
      </div>
      {update.isError && (
        <p role="alert" className="mt-3 text-xs text-orange-300">
          Could not save your setup: {(update.error as Error).message}
        </p>
      )}
      <p className="mt-4 text-[11px] text-faint">That's all the setup needed. No daily check-ins or activity logs.</p>
    </Modal>
  );
}
