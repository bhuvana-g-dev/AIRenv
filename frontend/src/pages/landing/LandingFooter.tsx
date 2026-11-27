import { Bot } from "lucide-react";
import { Link } from "react-router-dom";
import { Logo } from "../../components/effects";

const PRODUCT_LINKS = [
  { to: "/app", label: "Intelligence dashboard" },
  { to: "/app/map", label: "Air map" },
  { to: "/app/assistant", label: "AIRenv AI" },
  { to: "/app/community", label: "Community" },
  { to: "/app/impact", label: "Impact" },
];

const ATTRIBUTIONS = [
  "Air quality: Open-Meteo / Copernicus CAMS (CC BY 4.0)",
  "Stations: CPCB via data.gov.in, OpenAQ, Sensor.Community",
  "Maps © OpenStreetMap contributors (Leaflet)",
  "AQI method: CPCB National Air Quality Index",
];

export function LandingFooter() {
  return (
    <footer className="border-t hairline px-5 py-14">
      <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-muted">
            AI-powered Environmental Intelligence Network for families, schools, residential communities and local organisations.
          </p>
          <p className="mt-4 max-w-md text-[11px] leading-relaxed text-faint">
            AIRenv provides general information, not medical advice. Forecasts are estimates. Indoor air is not measured. Consult a doctor
            about health concerns.
          </p>
        </div>
        <div>
          <h2 className="label mb-3">Product</h2>
          <ul className="space-y-2 text-sm text-muted">
            {PRODUCT_LINKS.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="hover:text-ink">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="label mb-3">Data &amp; attribution</h2>
          <ul className="space-y-2 text-[12px] text-muted">
            {ATTRIBUTIONS.map((a) => (
              <li key={a}>{a}</li>
            ))}
            <li className="flex items-center gap-1.5">
              <Bot aria-hidden="true" className="h-3.5 w-3.5" /> AI: Google Gemini (optional)
            </li>
          </ul>
        </div>
      </div>
      <p className="mx-auto mt-10 max-w-6xl text-[11px] text-faint">
        © {new Date().getFullYear()} AIRenv · The Intelligence Behind Every Breath.
      </p>
    </footer>
  );
}
