import { ArrowRight, Bell, Bot, LayoutDashboard, Map as MapIcon, MapPin, Settings, Sprout, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Modal } from "./ui";

const STEPS = [
  { icon: MapPin, title: "Choose your location", text: "Use the location button at the top left of the header to search for a place or use your current position." },
  { icon: LayoutDashboard, title: "Intelligence", text: "See the current NAQI, pollutant levels, the forecast and recommendations for your location." },
  { icon: MapIcon, title: "Air Map", text: "View monitoring stations and the model estimate on a map. Stations appear only where a provider reports them." },
  { icon: Bot, title: "AIRenv AI", text: "Ask questions such as “Is it safe to play outside at 5 PM?”. Answers use the live readings for your location." },
  { icon: Users, title: "Community", text: "For schools, apartments and associations: check planned activities against the forecast and approve advisories." },
  { icon: Sprout, title: "Impact", text: "Compare exposure at different times, estimate emissions avoided, and track verified community actions." },
  { icon: Bell, title: "Alerts", text: "Alerts arrive automatically when conditions change. The bell in the header shows how many are unread." },
  { icon: Settings, title: "Settings", text: "Update who you are planning for, quiet hours, and connect Telegram to get alerts outside the app." },
];

export function HowToUse({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="How to use AIRenv" wide>
      <p className="mb-4 text-sm text-muted">AIRenv monitors the air in the background. You only need to set your location once.</p>
      <ol className="space-y-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3 rounded-xl border hairline bg-black/20 p-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald/10 text-mint" aria-hidden="true">
              <s.icon className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-medium">
                <span className="mr-1.5 font-mono text-[11px] text-faint">{String(i + 1).padStart(2, "0")}</span>
                {s.title}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <Link to="/about" onClick={onClose} className="mt-5 inline-flex items-center gap-1.5 text-sm text-mint hover:underline">
        Learn how AIRenv works <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
      </Link>
    </Modal>
  );
}
