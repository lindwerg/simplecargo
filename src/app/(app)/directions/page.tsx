import Link from "next/link";
import { Waypoints } from "lucide-react";

import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/button";

// Placeholder shell — the Направления grid ships in P1.5 (P15-5). The ПСЦ rate
// registry (P15-2) already lives under this section and is reachable here.
export default function DirectionsPage() {
  return (
    <div className="rounded-lg border border-border bg-surface-1">
      <EmptyState
        icon={Waypoints}
        title="Направления"
        description="Грид направлений появится на следующем этапе. Согласованные ставки уже можно вести."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/directions/pricing">Ставки ПСЦ</Link>
          </Button>
        }
      />
    </div>
  );
}
