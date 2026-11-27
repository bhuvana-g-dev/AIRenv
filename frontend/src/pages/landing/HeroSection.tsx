import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { Sparkles, Wind } from "lucide-react";
import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Aurora, ParticleField } from "../../components/effects";
import { Badge, Button } from "../../components/ui";
import { LiveSample } from "./LiveSample";

const fadeUp = (delay: number) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.9, delay },
});

export function HeroSection() {
  const navigate = useNavigate();
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const yHero = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const opacityHero = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const reduce = useReducedMotion();
  const exploreHow = () => document.getElementById("how")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });

  return (
    <section ref={heroRef} className="relative flex min-h-[100svh] items-center pt-24">
      <Aurora />
      <ParticleField density={1.2} haze={0.35} />
      <div
        className="grid-bg absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]"
        aria-hidden
      />
      <motion.div
        style={{ y: yHero, opacity: opacityHero }}
        className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-5 lg:grid-cols-[1.15fr_0.85fr]"
      >
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
          <motion.p {...fadeUp(0.15)} className="mt-5 font-display text-2xl font-medium tracking-tight text-ink md:text-[34px]">
            The Intelligence Behind Every Breath.
          </motion.p>
          <motion.p {...fadeUp(0.3)} className="mt-4 max-w-xl text-base leading-relaxed text-muted md:text-lg">
            Understand your environment. Anticipate pollution risks. Make smarter decisions together.
          </motion.p>
          <motion.div {...fadeUp(0.45)} className="mt-9 flex flex-wrap gap-3">
            <Button size="lg" onClick={exploreHow} icon={<Sparkles aria-hidden="true" className="h-4 w-4" />}>
              Explore Intelligence
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => void navigate("/app")}
              icon={<Wind aria-hidden="true" className="h-4 w-4" />}
            >
              View Live Air Quality
            </Button>
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
            className="mt-8 max-w-lg text-xs leading-relaxed text-faint"
          >
            "People should not have to monitor pollution constantly. AIRenv monitors the environment, understands the context, anticipates
            risks and helps communities make better decisions."
          </motion.p>
        </div>
        <LiveSample />
      </motion.div>
      <motion.div
        aria-hidden="true"
        className="absolute bottom-8 left-1/2 hidden -translate-x-1/2 md:block"
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 2.4, repeat: Infinity }}
      >
        <div className="h-10 w-6 rounded-full border hairline p-1">
          <div className="mx-auto h-2 w-1 rounded-full bg-mint/70" />
        </div>
      </motion.div>
    </section>
  );
}
