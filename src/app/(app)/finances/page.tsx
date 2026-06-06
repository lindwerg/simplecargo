import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Wallet, Send, FileText } from "lucide-react";

import { auth } from "@/lib/auth";
import { Money } from "@/components/ui/Money";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { SyncButton } from "@/components/finances/SyncButton";
import { TransactionFeed } from "@/components/finances/TransactionFeed";
import { isTochkaConfigured } from "@/lib/finances/tochka-client";
import {
  getFinanceSummary,
  listAccounts,
  listRecentTransactions,
  type AccountRow,
  type FinanceSummary,
  type TransactionRow,
} from "@/lib/finances/repository";

export const metadata = { title: "Финансы" };
export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "long", year: "numeric" });

/**
 * «Финансы» — движение денег по счетам компании в Точке: от кого пришли, кому
 * оплатили, и сводная экономика. Read-only: банк только читается, разнос
 * операций на сделки/контрагентов — на стороне приложения.
 */
export default async function FinancesPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const configured = isTochkaConfigured();

  // Best-effort reads — an empty DB renders the onboarding state, not an error.
  let summary: FinanceSummary | null = null;
  let transactions: TransactionRow[] = [];
  let accounts: AccountRow[] = [];
  if (configured) {
    try {
      [summary, transactions, accounts] = await Promise.all([
        getFinanceSummary(),
        listRecentTransactions({ limit: 100 }),
        listAccounts(),
      ]);
    } catch {
      // keep nulls; the empty state below still lets the operator trigger a sync
    }
  }

  const hasData = (summary?.txCount ?? 0) > 0;
  const balanceHint = summary?.balanceAt
    ? `на ${dateFmt.format(new Date(summary.balanceAt))}`
    : undefined;
  const flowHint = summary?.unlinkedCount ? `${summary.unlinkedCount} не разнесено` : undefined;

  return (
    <div className="space-y-[var(--space-section)]">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label-caps">Деньги</p>
          <h1 className="mt-1 break-words text-xl font-semibold tracking-tight text-text">Финансы</h1>
          <p className="mt-1 max-w-prose text-sm text-text-secondary">
            Приходы и расходы по счетам в Точке, сшитые с контрагентами и сделками.
          </p>
        </div>
        {configured && (
          <div className="flex flex-col items-end gap-2">
            <SyncButton />
            <nav className="flex gap-2">
              <Link
                href="/finances/statement"
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-text transition-colors hover:bg-surface-2"
              >
                <FileText className="size-4" aria-hidden /> Выписка
              </Link>
              <Link
                href="/finances/payments"
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-text transition-colors hover:bg-surface-2"
              >
                <Send className="size-4" aria-hidden /> Платёж
              </Link>
            </nav>
          </div>
        )}
      </header>

      {!configured ? (
        <section className="rounded-lg border border-border bg-surface-1">
          <EmptyState
            icon={Wallet}
            title="Точка не подключена"
            description="Задайте TOCHKA_JWT_TOKEN в переменных окружения, чтобы тянуть выписки и остатки."
          />
        </section>
      ) : (
        <>
          <section aria-label="Показатели" className="flex flex-wrap gap-3">
            <StatTile
              label="Остаток на счетах"
              value={<Money value={summary?.totalBalance ?? 0} />}
              variant="positive"
              {...(balanceHint ? { hint: balanceHint } : {})}
            />
            <StatTile
              label="Приход за месяц"
              value={<Money value={summary?.monthIn ?? 0} />}
              variant="accent"
            />
            <StatTile
              label="Расход за месяц"
              value={<Money value={summary?.monthOut ?? 0} />}
              variant="negative"
            />
            <StatTile
              label="Чистый поток за месяц"
              value={<Money value={summary?.netFlow ?? 0} sign />}
              {...(flowHint ? { hint: flowHint } : {})}
            />
          </section>

          {accounts.length > 0 && (
            <section aria-label="Счета" className="flex flex-wrap gap-3">
              {accounts.map((a) => (
                <StatTile
                  key={a.id}
                  label={a.title ?? "Счёт"}
                  value={<Money value={a.balance ?? 0} />}
                  {...(a.maskedNumber ? { hint: a.maskedNumber } : {})}
                />
              ))}
            </section>
          )}

          <section aria-labelledby="feed-heading" className="rounded-lg border border-border bg-surface-1">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 id="feed-heading" className="label-caps">
                Денежный поток
              </h2>
              {hasData && (
                <span className="text-xs text-text-tertiary">{summary?.txCount} операций</span>
              )}
            </div>
            {hasData ? (
              <TransactionFeed transactions={transactions} />
            ) : (
              <EmptyState
                icon={Wallet}
                title="Операций пока нет"
                description="Нажмите «Обновить из Точки», чтобы загрузить выписку по счетам."
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}
