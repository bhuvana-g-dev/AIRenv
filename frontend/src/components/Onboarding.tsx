import { AnimatePresence, motion } from "motion/react";
import { useCallback, useRef, useState } from "react";
import type { Profile } from "../lib/types";
import { AudienceStep, FamilyStep, LocationStep, ReachStep } from "./onboarding/steps";
import { useOnboardingDraft } from "./onboarding/useOnboardingDraft";
import { Button, Modal } from "./ui";

const STEPS = [
  { title: "Where should AIRenv watch the air?", Body: LocationStep },
  { title: "Who are you planning for?", Body: AudienceStep },
  { title: "Anyone who needs extra care? (optional)", Body: FamilyStep },
  { title: "How should we reach you?", Body: ReachStep },
];

export function Onboarding({ profile }: { profile: Profile }) {
  const [step, setStep] = useState(0);
  const { draft, patch, open, finish, saving, error } = useOnboardingDraft(profile);
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
  const { title, Body } = STEPS[step];

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
        Step {step + 1} of {STEPS.length}
      </p>
      <div className="mb-5 flex gap-1.5" aria-hidden="true">
        {STEPS.map((s, i) => (
          <motion.span
            key={s.title}
            className="h-1 flex-1 rounded-full"
            animate={{ background: i <= step ? "#35D399" : "rgba(124,231,180,0.12)" }}
          />
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.25 }}
        >
          <h3 ref={focusHeading} tabIndex={-1} className="mb-4 font-display text-base font-semibold">
            {title}
          </h3>
          <Body draft={draft} patch={patch} />
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
          {step < STEPS.length - 1 ? (
            <Button onClick={() => go(step + 1)}>Continue</Button>
          ) : (
            <Button onClick={() => finish(false)} loading={saving}>
              Start monitoring
            </Button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-xs text-orange-300">
          Could not save your setup: {error.message}
        </p>
      )}
      <p className="mt-4 text-[11px] text-faint">That's all the setup needed. No daily check-ins or activity logs.</p>
    </Modal>
  );
}
