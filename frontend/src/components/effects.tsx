import { useEffect, useId, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";

/** Soft, slowly drifting atmospheric gradients. Pure CSS transforms (GPU-friendly). */
export function Aurora({ className, intensity = 1 }: { className?: string; intensity?: number }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div
        className="absolute -left-[20%] -top-[30%] h-[80vh] w-[80vw] rounded-full blur-[110px] animate-aurora motion-reduce:animate-none"
        style={{ background: "radial-gradient(closest-side, rgba(53,211,153,0.22), transparent)", opacity: intensity }}
      />
      <div
        className="absolute -right-[15%] top-[10%] h-[70vh] w-[60vw] rounded-full blur-[120px] animate-aurora motion-reduce:animate-none"
        style={{
          background: "radial-gradient(closest-side, rgba(85,214,232,0.16), transparent)",
          animationDelay: "-8s",
          opacity: intensity,
        }}
      />
      <div
        className="absolute bottom-[-30%] left-[20%] h-[70vh] w-[70vw] rounded-full blur-[130px] animate-aurora motion-reduce:animate-none"
        style={{
          background: "radial-gradient(closest-side, rgba(124,231,180,0.12), transparent)",
          animationDelay: "-16s",
          opacity: intensity,
        }}
      />
    </div>
  );
}

/**
 * Floating particulate field drawn on a canvas. `density` scales particle count; `haze`
 * (0-1) tints particles warmer to hint at pollution load. Pauses when hidden, static
 * when the user prefers reduced motion.
 */
export function ParticleField({ className, density = 1, haze = 0.2 }: { className?: string; density?: number; haze?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    type P = { x: number; y: number; r: number; vx: number; vy: number; a: number; warm: boolean; phase: number };
    let particles: P[] = [];

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(140, (w * h) / 9000) * density);
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.8 + 0.3,
        vx: (Math.random() - 0.5) * 0.12 + 0.05,
        vy: -Math.random() * 0.12 - 0.02,
        a: Math.random() * 0.5 + 0.15,
        warm: Math.random() < haze,
        phase: Math.random() * Math.PI * 2,
      }));
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        if (!reduce) {
          p.x += p.vx + Math.sin(t / 4000 + p.phase) * 0.08;
          p.y += p.vy;
          if (p.y < -5) p.y = h + 5;
          if (p.x > w + 5) p.x = -5;
          if (p.x < -5) p.x = w + 5;
        }
        const tw = reduce ? 1 : 0.75 + Math.sin(t / 900 + p.phase) * 0.25;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.warm ? `rgba(250, 204, 120, ${p.a * tw * 0.7})` : `rgba(160, 240, 210, ${p.a * tw})`;
        ctx.fill();
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    };

    resize();
    raf = requestAnimationFrame(draw);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(draw);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [density, haze, reduce]);

  return <canvas ref={ref} aria-hidden className={cn("pointer-events-none absolute inset-0 h-full w-full", className)} />;
}

/** Logo mark: two flowing air lines and a particle. */
export function Logo({ className, withText = true }: { className?: string; withText?: boolean }) {
  const gid = `logo-g-${useId().replace(/:/g, "")}`;
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 64 64" className="h-8 w-8 shrink-0" aria-hidden>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7CE7B4" />
            <stop offset="1" stopColor="#55D6E8" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="18" fill="#0B1914" stroke="rgba(124,231,180,0.25)" />
        <path d="M14 38c6-2 10-8 18-8s12 6 18 4" stroke={`url(#${gid})`} strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M14 28c6-2 10-8 18-8s12 6 18 4" stroke={`url(#${gid})`} strokeWidth="4" fill="none" strokeLinecap="round" opacity=".5" />
        <circle cx="46" cy="44" r="4" fill="#35D399" />
      </svg>
      {withText && (
        <span className="font-display text-lg font-semibold tracking-tight">
          AIR<span className="text-mint">env</span>
        </span>
      )}
    </span>
  );
}
