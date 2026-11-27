import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Logo } from "../../components/effects";
import { Button } from "../../components/ui";
import { LANDING_SECTIONS } from "./content";

export function LandingNav() {
  const navigate = useNavigate();
  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="mx-auto mt-3 flex max-w-6xl items-center justify-between rounded-2xl border hairline bg-bg/60 px-4 py-2.5 backdrop-blur-xl md:px-5">
        <Logo />
        <nav className="hidden items-center gap-7 text-sm text-muted md:flex" aria-label="Landing">
          {LANDING_SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="hover:text-ink">
              {s.label}
            </a>
          ))}
        </nav>
        <Button
          size="sm"
          onClick={() => void navigate("/app")}
          icon={<ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />}
          className="flex-row-reverse"
        >
          Open dashboard
        </Button>
      </div>
    </header>
  );
}
