import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FileBarChart } from "lucide-react";

import { auth } from "@/lib/auth";
import { Money } from "@/components/ui/Money";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { SignOutButton } from "@/components/nav/SignOutButton";

export default async function DashboardPage() {
  // Defense in depth: the (app) layout already gates, but never render a dashboard
  // without an authoritative session in hand.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="space-y-[var(--space-section)]">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label-caps">Сводка</p>
          <h1 className="mt-1 break-words text-xl font-semibold tracking-tight text-text">
            {session.user.email}
          </h1>
        </div>
        {/* Mobile-only sign-out: the desktop SideRail already carries it. */}
        <span className="shrink-0 md:hidden">
          <SignOutButton />
        </span>
      </header>

      {/* Zeroed scaffold — honest until the ingestion pipeline lands (Phase 2). */}
      <section aria-label="Показатели" className="flex flex-wrap gap-3">
        <StatTile label="Активные направления" value="0" />
        <StatTile label="Маржа за месяц" value={<Money value={0} />} variant="accent" />
        <StatTile label="Вагонов в работе" value="0" />
      </section>

      <section className="rounded-lg border border-border bg-surface-1">
        <EmptyState
          icon={FileBarChart}
          title="Данных пока нет"
          description="Загрузка отчёта появится на следующем этапе."
        />
      </section>
    </div>
  );
}
