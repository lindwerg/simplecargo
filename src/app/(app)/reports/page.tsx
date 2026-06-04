import { FileText } from "lucide-react";

import { EmptyState } from "@/components/ui/EmptyState";

// Placeholder shell — the Отчётность ПВ table + xlsx export ships in P1.5.
export default function ReportsPage() {
  return (
    <div className="rounded-lg border border-border bg-surface-1">
      <EmptyState
        icon={FileText}
        title="Отчётность"
        description="Раздел появится на следующем этапе."
      />
    </div>
  );
}
