import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import {
  ArrowRight,
  Bell,
  Bot,
  Brain,
  Building2,
  CheckCircle2,
  CloudFog,
  Factory,
  GraduationCap,
  HardHat,
  Layers,
  MessageCircle,
  Radar,
  Scale,
  ShieldCheck,
  Sparkles,
  Sprout,
  Users,
  Wind,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Aurora, Logo, ParticleField } from "../components/effects";
import { AqiGauge } from "../components/env";
import { Badge, Button, cn } from "../components/ui";
import { api } from "../lib/api";
import { CATEGORY_COLORS, colorForAqi } from "../lib/aqi";
import type { Snapshot } from "../lib/types";

/* Illustrative values used only when the live API cannot be reached. Always labelled. */
const DEMO_SNAPSHOT = {
  aqi: { value: 286, category: { key: "poor" as const, label: "Poor", range: [201, 300] as [number, number], severity: 3, health: "" } },
  pollutants: { pm2_5: 118, pm10: 196, no2: 48 },
};

function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function SectionTitle({ eyebrow, title, text }: { eyebrow: string; title: ReactNode; text?: ReactNode }) {
  return (
    <Reveal className="mx-auto mb-12 max-w-3xl text-center">
      <p className="label mb-3 text-mint">{eyebrow}</p>
      <h2 className="font-display text-3xl font-semibold tracking-tight md:text-[42px] md:leading-[1.1]">{title}</h2>
      {text && <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-muted">{text}</p>}
    </Reveal>
  );
}

function LiveSample() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    api<Snapshot>("/api/air/current", { timeoutMs: 12000 })
      .then(setSnap)
      .catch(() => setFailed(true));
  }, []);
  const live = snap && !snap.is_demo;
  const value = live ? snap.aqi.value : failed ? DEMO_SNAPSHOT.aqi.value : null;
  const category = live ? snap.aqi.category : failed ? DEMO_SNAPSHOT.aqi.category : null;
  const pm = live
    ? { pm2_5: snap.pollutants.pm2_5.value, pm10: snap.pollutants.pm10.value, no2: snap.pollutants.no2.value }
    : failed
      ? DEMO_SNAPSHOT.pollutants
      : null;
  const color = colorForAqi(value);
  return (
    <motion.div initial={{ opacity: 0, scale: 0.94, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 1, delay: 0.4, ease: [0.22, 1, 0.36, 1] }} className="glass relative rounded-[28px] p-6">
      <div className="absolute -inset-px -z-10 rounded-[28px] opacity-60 blur-2xl" style={{ background: `radial-gradient(closest-side, ${color}30, transparent)` }} />
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{live ? snap.location.name : "New Delhi"}</p>
          <p className="text-[11px] text-faint">{live ? `Observed ${snap.observed_local?.slice(11, 16)} local · ${snap.utc_offset}` : failed ? "Live service unreachable" : "Connecting to live data…"}</p>
        </div>
        {live ? (
          <Badge color="#35D399" dot>
            Live · model estimate
          </Badge>
        ) : failed ? (
          <Badge color="#A78BFA">Demonstration data</Badge>
        ) : (
          <Badge color="#94A89D">Loading</Badge>
        )}
      </div>
      <div className="flex justify-center">
        <AqiGauge value={value} category={category} size={230} />
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2">
        {(["pm2_5", "pm10", "no2"] as const).map((k, i) => (
          <div key={k} className="rounded-xl border hairline bg-black/20 p-2.5 text-center">
            <p className="text-[10px] text-muted">{{ pm2_5: "PM2.5", pm10: "PM10", no2: "NO₂" }[k]}</p>
            <p className="font-display text-lg font-semibold">{pm ? Math.round(pm[k] ?? 0) : "—"}</p>
            <motion.div className="mx-auto mt-1 h-0.5 rounded-full" style={{ background: CATEGORY_COLORS[category?.key ?? "good"] }} initial={{ width: 0 }} animate={{ width: pm ? "60%" : 0 }} transition={{ delay: 0.8 + i * 0.1, duration: 0.8 }} />
            <p className="mt-1 text-[9px] text-faint">µg/m³</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-center text-[10px] leading-relaxed text-faint">
        {live ? `Source: ${snap.sources.air.name}. Estimated Indian NAQI from CPCB breakpoints.` : failed ? "Illustrative values for demonstration only. Not a real reading." : "\u00a0"}
      </p>
    </motion.div>
  );
}

const ENGINES = [
  {
    id: "ambient",
    icon: Radar,
    color: "#35D399",
    name: "Ambient Environmental Intelligence",
    tag: "Always on",
    text: "Collects air-quality, weather and forecast data on a schedule, computes the Indian NAQI, detects trends and poor-dispersion weather, and records history. No user input required.",
    points: ["PM2.5, PM10, NO₂, SO₂, CO, O₃ with units and timestamps", "Model forecasts and mixing-height–aware risk", "Station data from CPCB and OpenAQ when keys are configured", "Stale-data and outage states, never invented readings"],
  },
  {
    id: "conversation",
    icon: MessageCircle,
    color: "#55D6E8",
    name: "Conversation Intelligence",
    tag: "Optional · opt-in",
    text: "A Telegram bot joins the groups your community already uses. In opted-in groups it notices planned outdoor activities or open-burning discussions and checks them against the forecast.",
    points: ["Group-level opt-in by a group administrator", "Raw messages never stored, only extracted event fields", "Replies only when air quality warrants it", "Admin approval before advisories are posted"],
  },
  {
    id: "decision",
    icon: Brain,
    color: "#A78BFA",
    name: "AI Decision Intelligence",
    tag: "Gemini + rules",
    text: "Combines conditions, forecasts and community context into recommendations that explain what is happening, why it matters, what to do, the alternative, the expected benefit and the confidence.",
    points: ["Deterministic metrics, AI for reasoning and language", "Every AI number checked against source data", "Rule-based fallback when AI is unavailable", "Exposure kept separate from emissions"],
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const yHero = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const opacityHero = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-bg">
      {/* Nav */}
      <header className="fixed inset-x-0 top-0 z-50">
        <div className="mx-auto mt-3 flex max-w-6xl items-center justify-between rounded-2xl border hairline bg-bg/60 px-4 py-2.5 backdrop-blur-xl md:px-5">
          <Logo />
          <nav className="hidden items-center gap-7 text-sm text-muted md:flex" aria-label="Landing">
            <a href="#why" className="hover:text-ink">Why</a>
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#engines" className="hover:text-ink">Intelligence</a>
            <a href="#community" className="hover:text-ink">Community</a>
            <a href="#impact" className="hover:text-ink">Impact</a>
          </nav>
          <Button size="sm" onClick={() => navigate("/app")} icon={<ArrowRight className="h-3.5 w-3.5" />} className="flex-row-reverse">
            Open dashboard
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section ref={heroRef} className="relative flex min-h-[100svh] items-center pt-24">
        <Aurora />
        <ParticleField density={1.2} haze={0.35} />
        <div className="grid-bg absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" aria-hidden />
        <motion.div style={{ y: yHero, opacity: opacityHero }} className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-5 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              <Badge color="#7CE7B4" dot className="mb-6">
                AI-powered Environmental Intelligence Network
              </Badge>
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 24, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
              className="font-display text-[64px] font-semibold leading-[0.95] tracking-tight md:text-[104px]"
            >
              <span className="text-gradient">AIRenv</span>
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.15 }} className="mt-5 font-display text-2xl font-medium tracking-tight text-ink md:text-[34px]">
              The Intelligence Behind Every Breath.
            </motion.p>
            <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.3 }} className="mt-4 max-w-xl text-base leading-relaxed text-muted md:text-lg">
              Understand your environment. Anticipate pollution risks. Make smarter decisions together.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.45 }} className="mt-9 flex flex-wrap gap-3">
              <Button size="lg" onClick={() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth" })} icon={<Sparkles className="h-4 w-4" />}>
                Explore Intelligence
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate("/app")} icon={<Wind className="h-4 w-4" />}>
                View Live Air Quality
              </Button>
            </motion.div>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }} className="mt-8 max-w-lg text-xs leading-relaxed text-faint">
              "People should not have to monitor pollution constantly. AIRenv monitors the environment, understands the context, anticipates risks and helps communities make better decisions."
            </motion.p>
          </div>
          <LiveSample />
        </motion.div>
        <motion.div className="absolute bottom-8 left-1/2 hidden -translate-x-1/2 md:block" animate={{ y: [0, 8, 0] }} transition={{ duration: 2.4, repeat: Infinity }}>
          <div className="h-10 w-6 rounded-full border hairline p-1">
            <div className="mx-auto h-2 w-1 rounded-full bg-mint/70" />
          </div>
        </motion.div>
      </section>

      {/* 1. Why */}
      <section id="why" className="relative px-5 py-28">
        <SectionTitle
          eyebrow="Why AIRenv exists"
          title={<>Winter smog changes daily life. <span className="text-muted">Checking an AQI app shouldn't be another chore.</span></>}
          text="Cold, still winter air traps emissions close to the ground. Families, schools and associations still have to decide when to play outside, whether to hold an event, and what to do about local burning, usually with a single number and no context."
        />
        <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-3">
          {[
            { icon: CloudFog, t: "Pollution changes by the hour", d: "Concentrations swing with traffic peaks, heating and the height of the mixing layer. A morning reading says little about the afternoon." },
            { icon: Layers, t: "Dashboards demand attention", d: "Most tools wait for you to open them. Decisions are made in school groups and society chats, not in AQI apps." },
            { icon: Factory, t: "Generic advice ignores context", d: "Advice for a school sports day, an older parent, or an RWA dealing with leaf burning should not be the same sentence." },
          ].map((c, i) => (
            <Reveal key={c.t} delay={i * 0.1}>
              <div className="glass h-full rounded-2xl p-6">
                <c.icon className="h-6 w-6 text-mint" />
                <h3 className="mt-4 font-display text-lg font-semibold">{c.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{c.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* 2. How */}
      <section id="how" className="relative px-5 py-28">
        <Aurora intensity={0.5} />
        <SectionTitle eyebrow="How hybrid intelligence works" title="Three engines. One continuous loop." text="AIRenv runs in the background. It watches conditions, reads context you allow it to see, decides what matters, and reaches you where you already are." />
        <div className="relative mx-auto max-w-6xl">
          <div className="grid gap-4 md:grid-cols-4">
            {[
              { icon: Radar, t: "Sense", d: "Scheduled collection of air-quality, weather and forecast data every 15 minutes.", c: "#35D399" },
              { icon: MessageCircle, t: "Understand", d: "Optional: planned activities and burning concerns extracted from opted-in groups.", c: "#55D6E8" },
              { icon: Brain, t: "Decide", d: "Rules compute risk and figures; Gemini explains them for your audience and language.", c: "#A78BFA" },
              { icon: Bell, t: "Act", d: "Deduplicated alerts in-app and on Telegram, with cooldowns and quiet hours.", c: "#7CE7B4" },
            ].map((s, i) => (
              <Reveal key={s.t} delay={i * 0.12}>
                <div className="glass relative h-full rounded-2xl p-6">
                  <div className="flex items-center justify-between">
                    <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: `${s.c}18`, color: s.c }}>
                      <s.icon className="h-5 w-5" />
                    </span>
                    <span className="font-mono text-xs text-faint">0{i + 1}</span>
                  </div>
                  <h3 className="mt-5 font-display text-xl font-semibold">{s.t}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <svg className="pointer-events-none absolute left-0 top-1/2 hidden h-8 w-full -translate-y-1/2 md:block" preserveAspectRatio="none" viewBox="0 0 100 10" aria-hidden>
            <motion.path d="M2 5 L98 5" stroke="url(#flow)" strokeWidth="0.25" strokeDasharray="1 1.4" fill="none" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 2 }} />
            <defs>
              <linearGradient id="flow" x1="0" x2="1">
                <stop offset="0" stopColor="#35D399" />
                <stop offset="0.5" stopColor="#55D6E8" />
                <stop offset="1" stopColor="#A78BFA" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </section>

      {/* 3-5. Engines */}
      <section id="engines" className="relative px-5 py-28">
        <SectionTitle eyebrow="The intelligence engines" title="Built to work without you watching it." />
        <div className="mx-auto max-w-6xl space-y-6">
          {ENGINES.map((e, i) => (
            <Reveal key={e.id}>
              <div className={cn("glass grid items-center gap-8 overflow-hidden rounded-3xl p-7 md:grid-cols-2 md:p-10", i % 2 === 1 && "md:[&>*:first-child]:order-2")}>
                <div>
                  <div className="flex items-center gap-3">
                    <span className="grid h-12 w-12 place-items-center rounded-2xl" style={{ background: `${e.color}18`, color: e.color }}>
                      <e.icon className="h-6 w-6" />
                    </span>
                    <Badge color={e.color}>{e.tag}</Badge>
                  </div>
                  <h3 className="mt-5 font-display text-2xl font-semibold md:text-3xl">{e.name}</h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-muted">{e.text}</p>
                  <ul className="mt-5 space-y-2.5">
                    {e.points.map((p) => (
                      <li key={p} className="flex items-start gap-2.5 text-sm">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: e.color }} />
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

      {/* 6. Community */}
      <section id="community" className="relative px-5 py-28">
        <SectionTitle eyebrow="Community protection" title="Designed for the people who decide together." text="Recommendations adapt to who is affected and what is planned, from a school's afternoon football to an apartment association's waste problem." />
        <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: GraduationCap, t: "Schools & parents", d: "Outdoor PE and sports days checked against the forecast, with cleaner time windows suggested." },
            { icon: Building2, t: "Apartments & RWAs", d: "Open-burning discussions flagged with safer waste options. Verified initiatives tracked honestly." },
            { icon: Users, t: "Families", d: "Extra care when children, older adults or people with heart or lung conditions are at home." },
            { icon: HardHat, t: "Outdoor workers", d: "Earlier alerts and practical protection guidance when exposure cannot be avoided." },
          ].map((c, i) => (
            <Reveal key={c.t} delay={i * 0.08}>
              <div className="glass group h-full rounded-2xl p-6 transition-transform hover:-translate-y-1">
                <c.icon className="h-6 w-6 text-mint transition-transform group-hover:scale-110" />
                <h3 className="mt-4 font-display text-lg font-semibold">{c.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{c.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* 7. Impact */}
      <section id="impact" className="relative px-5 py-28">
        <Aurora intensity={0.4} />
        <SectionTitle eyebrow="Environmental impact, measured honestly" title="Exposure is not emissions. Participation is not proof." text="AIRenv keeps three kinds of impact apart and shows its methods and uncertainty for each. It never claims that an individual action lowered your neighbourhood's AQI." />
        <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-3">
          {[
            { icon: ShieldCheck, c: "#7CE7B4", t: "Personal exposure", d: "Estimated inhaled PM2.5 dose for an activity at different times, from forecast concentration × breathing rate × duration." },
            { icon: Sprout, c: "#55D6E8", t: "Emissions avoided", d: "Estimated CO₂e from switching transport or saving energy, with published emission factors and a ±25% uncertainty band." },
            { icon: Scale, c: "#A78BFA", t: "Community action", d: "Verified carpool, transit, segregation and no-burn actions, counted as participation, kept separate from estimates." },
          ].map((c, i) => (
            <Reveal key={c.t} delay={i * 0.1}>
              <div className="glass h-full rounded-2xl p-6">
                <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: `${c.c}18`, color: c.c }}>
                  <c.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-display text-lg font-semibold">{c.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{c.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal className="mx-auto mt-14 flex max-w-6xl flex-col items-center justify-between gap-6 rounded-3xl border border-mint/20 bg-gradient-to-r from-emerald/15 via-cyan/10 to-violet/10 p-8 text-center md:flex-row md:text-left">
          <div>
            <h3 className="font-display text-2xl font-semibold">See what the air is doing right now.</h3>
            <p className="mt-1 text-sm text-muted">Live model data for your location, with every source and timestamp shown.</p>
          </div>
          <Button size="lg" onClick={() => navigate("/app")} icon={<ArrowRight className="h-4 w-4" />} className="flex-row-reverse">
            Open the dashboard
          </Button>
        </Reveal>
      </section>

      {/* 8. Footer */}
      <footer className="border-t hairline px-5 py-14">
        <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <Logo />
            <p className="mt-3 max-w-sm text-sm text-muted">AI-powered Environmental Intelligence Network for families, schools, residential communities and local organisations.</p>
            <p className="mt-4 max-w-md text-[11px] leading-relaxed text-faint">AIRenv provides general information, not medical advice. Forecasts are estimates. Indoor air is not measured. Consult a doctor about health concerns.</p>
          </div>
          <div>
            <p className="label mb-3">Product</p>
            <ul className="space-y-2 text-sm text-muted">
              <li><Link to="/app" className="hover:text-ink">Intelligence dashboard</Link></li>
              <li><Link to="/app/map" className="hover:text-ink">Air map</Link></li>
              <li><Link to="/app/assistant" className="hover:text-ink">AIRenv AI</Link></li>
              <li><Link to="/app/community" className="hover:text-ink">Community</Link></li>
              <li><Link to="/app/impact" className="hover:text-ink">Impact</Link></li>
            </ul>
          </div>
          <div>
            <p className="label mb-3">Data &amp; attribution</p>
            <ul className="space-y-2 text-[12px] text-muted">
              <li>Air quality: Open-Meteo / Copernicus CAMS (CC BY 4.0)</li>
              <li>Stations: CPCB via data.gov.in, OpenAQ, Sensor.Community</li>
              <li>Maps © OpenStreetMap contributors (Leaflet)</li>
              <li>AQI method: CPCB National Air Quality Index</li>
              <li className="flex items-center gap-1.5"><Bot className="h-3.5 w-3.5" /> AI: Google Gemini (optional)</li>
            </ul>
          </div>
        </div>
        <p className="mx-auto mt-10 max-w-6xl text-[11px] text-faint">© {new Date().getFullYear()} AIRenv · The Intelligence Behind Every Breath.</p>
      </footer>
    </div>
  );
}

function EngineVisual({ id }: { id: string }) {
  const reduce = useReducedMotion();
  if (id === "conversation") {
    return (
      <div className="rounded-2xl border hairline bg-[#0b1620] p-4">
        <div className="mb-3 flex items-center justify-between text-xs text-muted">
          <span className="flex items-center gap-2"><MessageCircle className="h-3.5 w-3.5 text-cyan" /> Sunrise School Parents</span>
          <Badge color="#94A89D">Example</Badge>
        </div>
        <div className="space-y-3">
          <motion.div initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white/5 px-3.5 py-2.5 text-sm">
            Tomorrow we are conducting outdoor sports activities at 3 PM.
          </motion.div>
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.6 }} className="flex items-center gap-2 pl-1 text-[10px] text-faint">
            <Sparkles className="h-3 w-3 text-violet" /> extracted: sports · tomorrow · 15:00 · outdoor · message text discarded
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 1.1 }} className="ml-auto max-w-[90%] rounded-2xl rounded-tr-sm border border-cyan/20 bg-cyan/10 px-3.5 py-2.5 text-sm">
            🌫️ Tomorrow's forecast indicates elevated PM2.5 around the planned activity. Consider moving strenuous outdoor activities indoors or rescheduling them. Check the latest conditions before the event.
          </motion.div>
          <p className="text-right text-[10px] text-faint">posted after admin approval</p>
        </div>
      </div>
    );
  }
  if (id === "decision") {
    const fields = ["What is happening", "Why it matters", "Recommended action", "Alternative", "Expected benefit", "Confidence"];
    return (
      <div className="rounded-2xl border hairline bg-black/25 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet" />
          <span className="text-sm font-semibold">Every recommendation answers six questions</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {fields.map((f, i) => (
            <motion.div key={f} initial={reduce ? false : { opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }} className="rounded-xl border hairline bg-gradient-to-br from-violet/10 to-cyan/5 px-3 py-3 text-xs">
              <span className="font-mono text-[10px] text-faint">0{i + 1}</span>
              <p className="mt-1 font-medium">{f}</p>
            </motion.div>
          ))}
        </div>
      </div>
    );
  }
  const bars = [62, 74, 88, 120, 168, 210, 236, 198, 150, 118, 96, 84, 92, 130, 182, 224];
  return (
    <div className="rounded-2xl border hairline bg-black/25 p-5">
      <div className="mb-4 flex items-center justify-between text-xs text-muted">
        <span className="flex items-center gap-2"><Radar className="h-3.5 w-3.5 text-mint" /> Hourly PM2.5 pattern</span>
        <Badge color="#94A89D">Illustration</Badge>
      </div>
      <div className="flex h-40 items-end gap-1.5">
        {bars.map((b, i) => (
          <motion.div
            key={i}
            className="flex-1 rounded-t-md"
            style={{ background: colorForAqi(b > 200 ? 320 : b > 120 ? 220 : b > 90 ? 150 : 80) }}
            initial={{ height: 0, opacity: 0.4 }}
            whileInView={{ height: `${(b / 240) * 100}%`, opacity: 0.85 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.04, duration: 0.6 }}
          />
        ))}
      </div>
      <div className="mt-3 flex justify-between text-[10px] text-faint">
        <span>06:00</span>
        <span>cleaner window</span>
        <span>evening build-up</span>
      </div>
    </div>
  );
}
