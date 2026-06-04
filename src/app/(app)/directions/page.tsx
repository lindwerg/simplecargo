import { Waypoints } from "lucide-react";

import { EmptyState } from "@/components/ui/EmptyState";

// Placeholder shell — the Направления grid ships in P1.5.
export default function DirectionsPage() {
  return (
    <div className="rounded-lg border border-border bg-surface-1">
      <EmptyState
        icon={Waypoints}
        title="Направления"
        description="Раздел появится на следующем этапе."
      />
    </div>
  );
}
