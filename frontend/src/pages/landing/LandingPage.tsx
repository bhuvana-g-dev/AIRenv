import { SkipLink } from "../../components/SkipLink";
import { EnginesSection } from "./EnginesSection";
import { CommunitySection, HowSection, WhySection } from "./FeatureSections";
import { HeroSection } from "./HeroSection";
import { ImpactSection } from "./ImpactSection";
import { LandingFooter } from "./LandingFooter";
import { LandingNav } from "./LandingNav";

/** Product overview at /about: hero with a live sample reading, then one section per topic. */
export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-bg">
      <SkipLink />
      <LandingNav />
      <main id="main-content" tabIndex={-1} className="outline-none">
        <HeroSection />
        <WhySection />
        <HowSection />
        <EnginesSection />
        <CommunitySection />
        <ImpactSection />
      </main>
      <LandingFooter />
    </div>
  );
}
