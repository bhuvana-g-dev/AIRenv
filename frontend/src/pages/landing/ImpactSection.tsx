import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Aurora } from "../../components/effects";
import { Button } from "../../components/ui";
import { IMPACT_CARDS } from "./content";
import { Reveal, SectionTitle } from "./Reveal";

export function ImpactSection() {
  const navigate = useNavigate();
  return (
    <section id="impact" className="relative px-5 py-28">
      <Aurora intensity={0.4} />
      <SectionTitle
        eyebrow="Environmental impact, measured honestly"
        title="Exposure is not emissions. Participation is not proof."
        text="AIRenv keeps three kinds of impact apart and shows its methods and uncertainty for each. It never claims that an individual action lowered your neighbourhood's AQI."
      />
      <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-3">
        {IMPACT_CARDS.map((c, i) => (
          <Reveal key={c.title} delay={i * 0.1}>
            <div className="glass h-full rounded-2xl p-6">
              <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: `${c.color}18`, color: c.color }}>
                <c.icon aria-hidden="true" className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold">{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{c.text}</p>
            </div>
          </Reveal>
        ))}
      </div>
      <Reveal className="mx-auto mt-14 flex max-w-6xl flex-col items-center justify-between gap-6 rounded-3xl border border-mint/20 bg-gradient-to-r from-emerald/15 via-cyan/10 to-violet/10 p-8 text-center md:flex-row md:text-left">
        <div>
          <h3 className="font-display text-2xl font-semibold">See what the air is doing right now.</h3>
          <p className="mt-1 text-sm text-muted">Live model data for your location, with every source and timestamp shown.</p>
        </div>
        <Button
          size="lg"
          onClick={() => void navigate("/app")}
          icon={<ArrowRight aria-hidden="true" className="h-4 w-4" />}
          className="flex-row-reverse"
        >
          Open the dashboard
        </Button>
      </Reveal>
    </section>
  );
}
