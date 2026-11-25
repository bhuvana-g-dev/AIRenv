/** First focusable element on a page: jumps keyboard users past the navigation (WCAG 2.4.1). */
export function SkipLink({ target = "main-content" }: { target?: string }) {
  return (
    <a
      href={`#${target}`}
      onClick={(e) => {
        const el = document.getElementById(target);
        if (!el) return;
        e.preventDefault();
        el.focus();
        el.scrollIntoView({ block: "start" });
      }}
      className="sr-only rounded-xl bg-mint px-4 py-2 text-sm font-semibold text-[#04140d] focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100]"
    >
      Skip to main content
    </a>
  );
}
