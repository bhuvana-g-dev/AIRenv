import { motion } from "motion/react";
import { Aurora } from "../../components/effects";
import { AUDIENCE_CARDS, HOW_STEPS, WHY_CARDS } from "./content";
import { Reveal, SectionTitle } from "./Reveal";

export function WhySection() {
  return (
    <section id="why" className="relative px-5 py-28">
      <SectionTitle
        eyebrow="Why AIRenv exists"
        title={
          <>
            Winter smog changes daily life. <span className="text-muted">Checking an AQI app shouldn't be another chore.</span>
          </>
        }
        text="Cold, still winter air traps emissions close to the ground. Families, schools and associations still have to decide when to play outside, whether to hold an event, and what to do about local burning, usually with a single number and no context."
      />
      <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-3">
        {WHY_CARDS.map((c, i) => (
          <Reveal key={c.title} delay={i * 0.1}>
            <div className="glass h-full rounded-2xl p-6">
              <c.icon aria-hidden="true" className="h-6 w-6 text-mint" />
              <h3 className="mt-4 font-display text-lg font-semibold">{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{c.text}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function FlowLine() {
  return (
    <svg
      className="pointer-events-none absolute left-0 top-1/2 hidden h-8 w-full -translate-y-1/2 md:block"
      preserveAspectRatio="none"
      viewBox="0 0 100 10"
      aria-hidden
    >
      <motion.path
        d="M2 5 L98 5"
        stroke="url(#flow)"
        strokeWidth="0.25"
        strokeDasharray="1 1.4"
        fill="none"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 2 }}
      />
      <defs>
        <linearGradient id="flow" x1="0" x2="1">
          <stop offset="0" stopColor="#35D399" />
          <stop offset="0.5" stopColor="#55D6E8" />
          <stop offset="1" stopColor="#A78BFA" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function HowSection() {
  return (
    <section id="how" className="relative px-5 py-28">
      <Aurora intensity={0.5} />
      <SectionTitle
        eyebrow="How hybrid intelligence works"
        title="Three engines. One continuous loop."
        text="AIRenv runs in the background. It watches conditions, reads context you allow it to see, decides what matters, and reaches you where you already are."
      />
      <div className="relative mx-auto max-w-6xl">
        <div className="grid gap-4 md:grid-cols-4">
          {HOW_STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 0.12}>
              <div className="glass relative h-full rounded-2xl p-6">
                <div className="flex items-center justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: `${s.color}18`, color: s.color }}>
                    <s.icon aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <span className="font-mono text-xs text-faint">0{i + 1}</span>
                </div>
                <h3 className="mt-5 font-display text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <FlowLine />
      </div>
    </section>
  );
}

export function CommunitySection() {
  return (
    <section id="community" className="relative px-5 py-28">
      <SectionTitle
        eyebrow="Community protection"
        title="Designed for the people who decide together."
        text="Recommendations adapt to who is affected and what is planned, from a school's afternoon football to an apartment association's waste problem."
      />
      <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-2 lg:grid-cols-4">
        {AUDIENCE_CARDS.map((c, i) => (
          <Reveal key={c.title} delay={i * 0.08}>
            <div className="glass group h-full rounded-2xl p-6 transition-transform hover:-translate-y-1">
              <c.icon aria-hidden="true" className="h-6 w-6 text-mint transition-transform group-hover:scale-110" />
              <h3 className="mt-4 font-display text-lg font-semibold">{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{c.text}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
