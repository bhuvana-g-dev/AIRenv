import { Briefcase, Building2, GraduationCap, HeartPulse, Home, Users } from "lucide-react";
import type { FamilyContext } from "./types";

export const COMMUNITY_TYPES = [
  { value: "household", label: "Family / household", icon: Home },
  { value: "school", label: "School or parents' group", icon: GraduationCap },
  { value: "apartment", label: "Apartment association", icon: Building2 },
  { value: "rwa", label: "Residents' welfare association", icon: Users },
  { value: "community_org", label: "Community organisation", icon: HeartPulse },
  { value: "workplace", label: "Outdoor workers / workplace", icon: Briefcase },
];

export const FAMILY_FIELDS: { key: keyof FamilyContext; label: string }[] = [
  { key: "children", label: "Children" },
  { key: "older_adults", label: "Older adults" },
  { key: "respiratory_or_heart_condition", label: "Someone with asthma, lung or heart conditions" },
  { key: "pregnancy", label: "Pregnancy in the household" },
  { key: "outdoor_workers", label: "People who work outdoors" },
];
