import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";

import { auth } from "@/lib/auth";
import { Money } from "@/components/ui/Money";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata = {
  title: "Финансы",
};

/**
 * «Финансы» — движение денег по счетам компании в Точке, сшитое с контрагентами
 * (по ИНН) и сделками (по сумме + назначению). Read-only MVP.
 *
 * Каркас (P-FIN-1): навигация/гейтинг/CSP. Данные подключаются с P-FIN-6,
 * когда появятся синк выписок (P-FIN-4) и разнос операций (P-FIN-5).
 */
export default async function FinancesPage() {
  // Defense in depth: the (app) layout already gates, but never render financial
  // figures without an authoritative session in hand.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="space-y-[var(--space-section)]">
      <header className="min-w-0">
        <p className="label-caps">Деньги</p>
        <h1 className="mt-1 break-words text-xl font-semibold tracking-tight text-text">
          Финансы
        </h1>
        <p className="mt-1 max-w-prose text-sm text-text-secondary">
          Приходы и расходы по счетам, сшитые с контрагентами и сделками. Подключение
          к банку появится на следующем этапе.
        </p>
      </header>

      {/* Zeroed scaffold — honest until the Точка sync + reconciliation land. */}
      <section aria-label="Показатели" className="flex flex-wrap gap-3">
        <StatTile label="Остаток на счетах" value={<Money value={0} />} variant="positive" />
        <StatTile label="Приход за месяц" value={<Money value={0} />} variant="accent" />
        <StatTile label="Расход за месяц" value={<Money value={0} />} variant="negative" />
        <StatTile
          label="Маржа факт / план"
          value={<Money value={0} sign />}
          variant="default"
        />
      </section>

      <section className="rounded-lg border border-border bg-surface-1">
        <EmptyState
          icon={Wallet}
          title="Банк ещё не подключён"
          description="Скоро здесь появится лента операций: от кого пришли деньги, кому оплатили, и как это бьётся с вашими сделками."
        />
      </section>
    </div>
  );
}
