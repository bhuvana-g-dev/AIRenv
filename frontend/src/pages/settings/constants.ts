import { Bell, Database, Lock, MessageCircle, Server, User } from "lucide-react";

export const LANGUAGES = [
  ["en", "English"],
  ["hi", "हिन्दी (Hindi)"],
  ["ta", "தமிழ் (Tamil)"],
  ["bn", "বাংলা (Bengali)"],
  ["mr", "मराठी (Marathi)"],
  ["te", "తెలుగు (Telugu)"],
  ["kn", "ಕನ್ನಡ (Kannada)"],
  ["pa", "ਪੰਜਾਬੀ (Punjabi)"],
] as const;

export const CATEGORY_LABELS: Record<string, string> = {
  critical: "Critical environmental alerts",
  deterioration: "Pollution deterioration",
  forecast: "Forecast warnings",
  community: "School & community activity concerns",
  recommendation: "AI-generated recommendations",
  positive: "Positive environmental developments",
};

export const SECTIONS = [
  { id: "profile", label: "Profile & location", icon: User },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "telegram", label: "Telegram", icon: MessageCircle },
  { id: "privacy", label: "Privacy", icon: Lock },
  { id: "sources", label: "Data sources", icon: Database },
  { id: "system", label: "System", icon: Server },
];

/** The model source is always on; station providers can be toggled for the air map. */
export const ALWAYS_ON_SOURCE = "open_meteo";

export const DATA_SOURCES = [
  { key: ALWAYS_ON_SOURCE, label: "Open-Meteo / CAMS model", description: "Always used for the location time series and forecast" },
  { key: "cpcb", label: "CPCB real-time AQI (data.gov.in)", description: "Official Indian monitoring stations" },
  { key: "openaq", label: "OpenAQ", description: "Global aggregated monitor data" },
  { key: "sensor_community", label: "Sensor.Community", description: "Citizen low-cost sensors (uncalibrated)" },
];

export const SEVERITY_OPTIONS = [
  { value: "info", label: "Everything" },
  { value: "low", label: "Low and above" },
  { value: "medium", label: "Medium and above" },
  { value: "high", label: "High and above" },
  { value: "critical", label: "Critical only" },
] as const;
