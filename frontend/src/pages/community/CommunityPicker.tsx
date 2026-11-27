import { cn } from "../../lib/cn";
import { COMMUNITY_TYPE_LABEL } from "../../lib/community";
import type { Community } from "../../lib/types";

export function CommunityPicker({
  communities,
  selected,
  onSelect,
}: {
  communities: Community[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Choose a community">
      {communities.map((c) => (
        <button
          type="button"
          key={c.id}
          aria-pressed={selected === c.id}
          onClick={() => onSelect(c.id)}
          className={cn(
            "relative rounded-xl border px-3.5 py-2 text-left text-sm transition-colors",
            selected === c.id ? "border-mint/30 bg-emerald/10" : "hairline bg-black/15 hover:bg-white/5",
          )}
        >
          <span className="font-medium">{c.name}</span>
          <span className="ml-2 text-[11px] text-muted">{COMMUNITY_TYPE_LABEL[c.type] ?? c.type}</span>
          {(c.pending_advisories ?? 0) > 0 && (
            <span className="ml-2 rounded-full bg-cyan/20 px-1.5 text-[10px] text-cyan">{c.pending_advisories} pending</span>
          )}
        </button>
      ))}
    </div>
  );
}
