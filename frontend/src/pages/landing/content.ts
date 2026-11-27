import {
  Bell,
  Brain,
  Building2,
  CloudFog,
  Factory,
  GraduationCap,
  HardHat,
  Layers,
  MessageCircle,
  Radar,
  Scale,
  ShieldCheck,
  Sprout,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface FeatureCard {
  icon: LucideIcon;
  title: string;
  text: string;
  color?: string;
}

export const LANDING_SECTIONS = [
  { id: "why", label: "Why" },
  { id: "how", label: "How it works" },
  { id: "engines", label: "Intelligence" },
  { id: "community", label: "Community" },
  { id: "impact", label: "Impact" },
];

export const WHY_CARDS: FeatureCard[] = [
  {
    icon: CloudFog,
    title: "Pollution changes by the hour",
    text: "Concentrations swing with traffic peaks, heating and the height of the mixing layer. A morning reading says little about the afternoon.",
  },
  {
    icon: Layers,
    title: "Dashboards demand attention",
    text: "Most tools wait for you to open them. Decisions are made in school groups and society chats, not in AQI apps.",
  },
  {
    icon: Factory,
    title: "Generic advice ignores context",
    text: "Advice for a school sports day, an older parent, or an RWA dealing with leaf burning should not be the same sentence.",
  },
];

export const HOW_STEPS: FeatureCard[] = [
  {
    icon: Radar,
    title: "Sense",
    text: "Scheduled collection of air-quality, weather and forecast data every 15 minutes.",
    color: "#35D399",
  },
  {
    icon: MessageCircle,
    title: "Understand",
    text: "Optional: planned activities and burning concerns extracted from opted-in groups.",
    color: "#55D6E8",
  },
  {
    icon: Brain,
    title: "Decide",
    text: "Rules compute risk and figures; Gemini explains them for your audience and language.",
    color: "#A78BFA",
  },
  { icon: Bell, title: "Act", text: "Deduplicated alerts in-app and on Telegram, with cooldowns and quiet hours.", color: "#7CE7B4" },
];

export type EngineId = "ambient" | "conversation" | "decision";

export const ENGINES: { id: EngineId; icon: LucideIcon; color: string; name: string; tag: string; text: string; points: string[] }[] = [
  {
    id: "ambient",
    icon: Radar,
    color: "#35D399",
    name: "Ambient Environmental Intelligence",
    tag: "Always on",
    text: "Collects air-quality, weather and forecast data on a schedule, computes the Indian NAQI, detects trends and poor-dispersion weather, and records history. No user input required.",
    points: [
      "PM2.5, PM10, NO₂, SO₂, CO, O₃ with units and timestamps",
      "Model forecasts and mixing-height–aware risk",
      "Station data from CPCB and OpenAQ when keys are configured",
      "Stale-data and outage states, never invented readings",
    ],
  },
  {
    id: "conversation",
    icon: MessageCircle,
    color: "#55D6E8",
    name: "Conversation Intelligence",
    tag: "Optional · opt-in",
    text: "A Telegram bot joins the groups your community already uses. In opted-in groups it notices planned outdoor activities or open-burning discussions and checks them against the forecast.",
    points: [
      "Group-level opt-in by a group administrator",
      "Raw messages never stored, only extracted event fields",
      "Replies only when air quality warrants it",
      "Admin approval before advisories are posted",
    ],
  },
  {
    id: "decision",
    icon: Brain,
    color: "#A78BFA",
    name: "AI Decision Intelligence",
    tag: "Gemini + rules",
    text: "Combines conditions, forecasts and community context into recommendations that explain what is happening, why it matters, what to do, the alternative, the expected benefit and the confidence.",
    points: [
      "Deterministic metrics, AI for reasoning and language",
      "Every AI number checked against source data",
      "Rule-based fallback when AI is unavailable",
      "Exposure kept separate from emissions",
    ],
  },
];

export const AUDIENCE_CARDS: FeatureCard[] = [
  {
    icon: GraduationCap,
    title: "Schools & parents",
    text: "Outdoor PE and sports days checked against the forecast, with cleaner time windows suggested.",
  },
  {
    icon: Building2,
    title: "Apartments & RWAs",
    text: "Open-burning discussions flagged with safer waste options. Verified initiatives tracked honestly.",
  },
  { icon: Users, title: "Families", text: "Extra care when children, older adults or people with heart or lung conditions are at home." },
  { icon: HardHat, title: "Outdoor workers", text: "Earlier alerts and practical protection guidance when exposure cannot be avoided." },
];

export const IMPACT_CARDS: FeatureCard[] = [
  {
    icon: ShieldCheck,
    color: "#7CE7B4",
    title: "Personal exposure",
    text: "Estimated inhaled PM2.5 dose for an activity at different times, from forecast concentration × breathing rate × duration.",
  },
  {
    icon: Sprout,
    color: "#55D6E8",
    title: "Emissions avoided",
    text: "Estimated CO₂e from switching transport or saving energy, with published emission factors and a ±25% uncertainty band.",
  },
  {
    icon: Scale,
    color: "#A78BFA",
    title: "Community action",
    text: "Verified carpool, transit, segregation and no-burn actions, counted as participation, kept separate from estimates.",
  },
];

/** The six questions every recommendation answers (decision-engine illustration). */
export const RECOMMENDATION_FIELDS = [
  "What is happening",
  "Why it matters",
  "Recommended action",
  "Alternative",
  "Expected benefit",
  "Confidence",
];

/** Illustrative hourly PM2.5 pattern for the ambient-engine visual. Not real data. */
export const ILLUSTRATIVE_PM_BARS = [62, 74, 88, 120, 168, 210, 236, 198, 150, 118, 96, 84, 92, 130, 182, 224];
