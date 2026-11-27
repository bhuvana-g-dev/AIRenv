import { useLiveStatus } from "../../lib/live";

const STATUS_VIEW = {
  live: { color: "#35D399", label: "Live" },
  connecting: { color: "#FACC15", label: "Connecting" },
  reconnecting: { color: "#FB923C", label: "Reconnecting" },
} as const;

export function LiveIndicator() {
  const status = useLiveStatus((s) => s.status);
  const { color: c, label } =
    status === "live" ? STATUS_VIEW.live : status === "connecting" ? STATUS_VIEW.connecting : STATUS_VIEW.reconnecting;
  return (
    <span
      role="status"
      className="hidden items-center gap-2 rounded-full border hairline bg-black/20 px-2.5 py-1 text-[11px] text-muted sm:inline-flex"
      title="Real-time update channel (Server-Sent Events)"
    >
      <span className="relative flex h-2 w-2" aria-hidden="true">
        {status === "live" && (
          <span className="absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping" style={{ background: c }} />
        )}
        <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: c }} />
      </span>
      <span className="sr-only">Real-time updates: </span>
      {label}
    </span>
  );
}
