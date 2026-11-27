export function MapLegend() {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-[400] flex flex-wrap gap-2 rounded-xl border hairline bg-bg/80 px-3 py-2 text-[10px] text-muted backdrop-blur">
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-mint" /> reference monitor
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-mint" /> low-cost sensor
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-3 w-3 rounded-full border-2 border-dashed border-mint" /> model estimate
      </span>
      <span>colour = CPCB sub-index of reported values · click map to select a point (or search a location)</span>
    </div>
  );
}
