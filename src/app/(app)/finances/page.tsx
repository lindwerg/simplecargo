import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Wallet, Send, FileText } from "lucide-react";

import { LiveRefresh } from "@/components/realtime/LiveRefresh";

import { auth } from "@/lib/auth";
import { Money } from "@/components/ui/Money";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { SyncButton } from "@/components/finances/SyncButton";
import { TransactionFeed } from "@/components/finances/TransactionFeed";
import { DirectionPnl } from "@/components/finances/DirectionPnl";
import { InboundInvoices } from "@/components/finances/InboundInvoices";
import { Debts } from "@/components/finances/Debts";
import { isTochkaConfigured } from "@/lib/finances/tochka-client";
import {
  getDebtSummary,
  getDirectionPnl,
  getFinanceSummary,
  listAccounts,
  listDebts,
  listInboundInvoices,
  listRecentTransactions,
  type AccountRow,
  type DebtRow,
  type DebtSummary,
  type DirectionPnlRow,
  type FinanceSummary,
  type InboundInvoiceRow,
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
  let pnl: DirectionPnlRow[] = [];
  if (configured) {
    try {
      [summary, transactions, accounts, pnl] = await Promise.all([
        getFinanceSummary(),
        listRecentTransactions({ limit: 100 }),
        listAccounts(),
        getDirectionPnl(),
      ]);
    } catch {
      // keep nulls; the empty state below still lets the operator trigger a sync
    }
  }

  // Счета из почты живут независимо от Точки (их создаёт ИИ из писем).
  let inboundInvoices: InboundInvoiceRow[] = [];
  try {
    inboundInvoices = await listInboundInvoices(100);
  } catch {
    // таблицы может не быть на самом раннем деплое — пустой список
  }

  // Задолженности (AR/AP) — считаются из неоплаченных счетов, независимо от Точки.
  let debtSummary: DebtSummary | null = null;
  let debts: DebtRow[] = [];
  try {
    [debtSummary, debts] = await Promise.all([getDebtSummary(), listDebts({ limit: 100 })]);
  } catch {
    // нет таблицы — пустое состояние
  }

  const hasData = (summary?.txCount ?? 0) > 0;
  const pendingInvoices = inboundInvoices.filter((i) => i.status === "pending").length;
  const balanceHint = summary?.balanceAt
    ? `на ${dateFmt.format(new Date(summary.balanceAt))}`
    : undefined;
  const flowHint = summary?.unlinkedCount ? `${summary.unlinkedCount} не разнесено` : undefined;

  return (
    <div className="space-y-[var(--space-section)]">
      <LiveRefresh />
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
          <section aria-label="Показатели" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
            <section aria-label="Счета" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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

          {pnl.length > 0 && (
            <section aria-labelledby="pnl-heading" className="rounded-lg border border-border bg-surface-1">
              <div className="border-b border-border px-4 py-3">
                <h2 id="pnl-heading" className="label-caps">
                  План-факт по направлениям
                </h2>
              </div>
              <DirectionPnl rows={pnl} />
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

      {debtSummary && (debtSummary.payableCount > 0 || debtSummary.receivableCount > 0) && (
        <>
          <section aria-label="Задолженности — показатели" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="К оплате (мы должны)"
              value={<Money value={debtSummary.payableTotal} />}
              variant="negative"
              hint={`${debtSummary.payableCount} счёт(ов)`}
            />
            <StatTile
              label="Просрочено к оплате"
              value={<Money value={debtSummary.payableOverdue} />}
              variant="negative"
              {...(debtSummary.payableOverdueCount > 0
                ? { hint: `${debtSummary.payableOverdueCount} просрочено` }
                : {})}
            />
            <StatTile
              label="К получению (нам должны)"
              value={<Money value={debtSummary.receivableTotal} />}
              variant="positive"
              hint={`${debtSummary.receivableCount} счёт(ов)`}
            />
            <StatTile
              label="Просрочено к получению"
              value={<Money value={debtSummary.receivableOverdue} />}
              variant="positive"
              {...(debtSummary.receivableOverdueCount > 0
                ? { hint: `${debtSummary.receivableOverdueCount} просрочено` }
                : {})}
            />
          </section>

          <section
            aria-labelledby="debts-heading"
            className="rounded-lg border border-border bg-surface-1"
          >
            <div className="border-b border-border px-4 py-3">
              <h2 id="debts-heading" className="label-caps">
                Задолженности
              </h2>
            </div>
            <div className="p-4">
              <Debts debts={debts} />
            </div>
          </section>
        </>
      )}

      <section aria-labelledby="inbound-invoices-heading" className="rounded-lg border border-border bg-surface-1">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 id="inbound-invoices-heading" className="label-caps">
            Счета из почты
          </h2>
          {pendingInvoices > 0 && (
            <span className="rounded-pill bg-warn-quiet px-2 py-0.5 text-xs font-medium text-warn">
              {pendingInvoices} ожидают оплаты
            </span>
          )}
        </div>
        <div className="p-4">
          <InboundInvoices invoices={inboundInvoices} />
        </div>
      </section>
    </div>
  );
}
