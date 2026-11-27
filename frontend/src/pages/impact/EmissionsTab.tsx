import { EnergyCard } from "./EnergyCard";
import { TripCard } from "./TripCard";

export function EmissionsTab() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <TripCard />
      <EnergyCard />
    </div>
  );
}
