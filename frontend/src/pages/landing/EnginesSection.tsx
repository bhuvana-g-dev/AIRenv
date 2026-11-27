import { CheckCircle2 } from "lucide-react";
import { Badge } from "../../components/ui";
import { cn } from "../../lib/cn";
import { ENGINES } from "./content";
import { EngineVisual } from "./EngineVisuals";
import { Reveal, SectionTitle } from "./Reveal";

export function EnginesSection() {
  return (
    <section id="engines" className="relative px-5 py-28">
      <SectionTitle eyebrow="The intelligence engines" title="Built to work without you watching it." />
      <div className="mx-auto max-w-6xl space-y-6">
        {ENGINES.map((e, i) => (
          <Reveal key={e.id}>
            <div
              className={cn(
                "glass grid items-center gap-8 overflow-hidden rounded-3xl p-7 md:grid-cols-2 md:p-10",
                i % 2 === 1 && "md:[&>*:first-child]:order-2",
              )}
            >
              <div>
                <div className="flex items-center gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl" style={{ background: `${e.color}18`, color: e.color }}>
                    <e.icon aria-hidden="true" className="h-6 w-6" />
                  </span>
                  <Badge color={e.color}>{e.tag}</Badge>
                </div>
                <h3 className="mt-5 font-display text-2xl font-semibold md:text-3xl">{e.name}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-muted">{e.text}</p>
                <ul className="mt-5 space-y-2.5">
                  {e.points.map((p) => (
                    <li key={p} className="flex items-start gap-2.5 text-sm">
                      <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" style={{ color: e.color }} />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
              <EngineVisual id={e.id} />
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
