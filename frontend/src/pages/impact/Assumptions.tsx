import { Info } from "lucide-react";

export function Assumptions({ items, title = "Assumptions & method" }: { items: string[]; title?: string }) {
  return (
    <div className="rounded-xl border hairline bg-black/15 p-3.5">
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted">
        <Info aria-hidden="true" className="h-3.5 w-3.5" /> {title}
      </p>
      <ul className="space-y-1 text-[11px] leading-relaxed text-muted">
        {items.map((a) => (
          <li key={a}>· {a}</li>
        ))}
      </ul>
    </div>
  );
}
