import { motion } from "motion/react";
import { Bike, Calculator, ShieldCheck, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { PageHeader, Tabs } from "../../components/ui";
import { tabId, tabPanelId } from "../../lib/tabs";
import { CommunityTab } from "./CommunityTab";
import { EmissionsTab } from "./EmissionsTab";
import { ExposureTab } from "./ExposureTab";

type ImpactTab = "exposure" | "emissions" | "community";

const TAB_DEFS: { value: ImpactTab; label: string; icon: LucideIcon }[] = [
  { value: "exposure", label: "Exposure", icon: ShieldCheck },
  { value: "emissions", label: "Emissions", icon: Bike },
  { value: "community", label: "Community", icon: Calculator },
];

const TABS = TAB_DEFS.map(({ value, label, icon: Icon }) => ({
  value,
  label: (
    <span className="flex items-center gap-1.5">
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {label}
    </span>
  ),
}));

export default function ImpactPage() {
  const [tab, setTab] = useState<ImpactTab>("exposure");
  return (
    <div>
      <PageHeader
        eyebrow="Impact intelligence"
        title="What difference do choices make?"
        description="Three separate kinds of impact, each with its method and uncertainty. None of them is presented as a change in your neighbourhood's air quality."
        actions={<Tabs label="Impact type" idPrefix="impact" layoutId="impact-tab" value={tab} onChange={setTab} tabs={TABS} />}
      />
      <motion.div
        key={tab}
        id={tabPanelId("impact")}
        role="tabpanel"
        aria-labelledby={tabId("impact", tab)}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {tab === "exposure" && <ExposureTab />}
        {tab === "emissions" && <EmissionsTab />}
        {tab === "community" && <CommunityTab />}
      </motion.div>
    </div>
  );
}
