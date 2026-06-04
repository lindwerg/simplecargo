import { Inbox } from "lucide-react";

import { EmptyState } from "@/components/ui/EmptyState";

// Placeholder shell — the RFQ Запросы board ships in P1.6/P1.7.
export default function RequestsPage() {
  return (
    <div className="rounded-lg border border-border bg-surface-1">
      <EmptyState
        icon={Inbox}
        title="Запросы"
        description="Раздел появится на следующем этапе."
      />
    </div>
  );
}
