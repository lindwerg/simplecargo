import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Calculator, Handshake, Inbox, Plus, Wallet } from "lucide-react";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { orders } from "@/lib/db/schema/orders";
import { counterparties } from "@/lib/db/schema/counterparties";
import { Money } from "@/components/ui/Money";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/components/nav/SignOutButton";
import { dealStatusMeta } from "@/components/trades/dealStatusMeta";
import { stageForStatus } from "@/components/trades/dealStageMeta";
import { getFinanceSummary } from "@/lib/finances/repository";
import { countUnresolvedQuarantine } from "@/lib/mail-intake/quarantine-repo";

export const metadata = { title: "Сводка" };
export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });

const RECENT_DEALS_LIMIT = 5;

interface DealRow {
  id: string;
  orderNumber: string | null;
  status: string;
  clientName: string | null;
  createdAt: Date;
}

/**
 * «Сводка» — стартовый экран оператора: быстрые действия и живые показатели
 * по сделкам, деньгам и почте. Все чтения best-effort: ранний деплой без
 * таблиц рендерит нули, а не падает (как finances/page.tsx).
 */
export default async function DashboardPage() {
  // Defense in depth: the (app) layout already gates, but never render a dashboard
  // without an authoritative session in hand.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }

  // Сделки: один запрос — и счётчик воронки, и последние пять.
  let dealRows: DealRow[] = [];
  try {
    dealRows = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        clientName: counterparties.nameCanonical,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .leftJoin(counterparties, eq(orders.clientSuggestedId, counterparties.id))
      .orderBy(desc(orders.createdAt));
  } catch {
    // таблиц может не быть на самом раннем деплое — пустой список
  }
  const funnelCount = dealRows.filter((r) => stageForStatus(r.status) !== null).length;
  const recentDeals = dealRows.slice(0, RECENT_DEALS_LIMIT);

  // Финансы: остаток и чистый поток за месяц из Точки.
  let totalBalance = 0;
  let netFlow = 0;
  try {
    const summary = await getFinanceSummary();
    totalBalance = summary.totalBalance;
    netFlow = summary.netFlow;
  } catch {
    // банк не подключён или таблиц нет — нули
  }

  // Почта: письма, ожидающие ручной проверки.
  let quarantineCount = 0;
  try {
    quarantineCount = await countUnresolvedQuarantine();
  } catch {
    // нет таблицы карантина — ноль
  }

  return (
    <div className="space-y-[var(--space-section)]">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label-caps">Сводка</p>
          <h1 className="mt-1 break-words text-xl font-semibold tracking-tight text-text">
            {session.user.email}
          </h1>
          <p className="mt-1 max-w-prose text-sm text-text-secondary">
            Сделки, деньги и почта на одном экране — что происходит и что требует внимания.
          </p>
        </div>
        {/* Mobile-only sign-out: the desktop SideRail already carries it. */}
        <span className="shrink-0 md:hidden">
          <SignOutButton />
        </span>
      </header>

      <section aria-label="Действия" className="grid grid-cols-2 gap-3">
        <Link
          href="/inbox"
          className="group flex items-center gap-3 rounded-lg border border-border bg-surface-1 px-5 py-6 transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out-quad)] hover:-translate-y-[2px] active:translate-y-0 active:opacity-90 focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-surface-2 text-text-secondary transition-colors group-hover:text-text">
            <Inbox className="size-5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-semibold text-text">Входящие</span>
            <span className="block text-xs text-text-tertiary">Почта и документы</span>
          </span>
        </Link>
        <Link
          href="/deals/new"
          className="group flex items-center gap-3 rounded-lg border border-border bg-surface-1 px-5 py-6 transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out-quad)] hover:-translate-y-[2px] active:translate-y-0 active:opacity-90 focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent-quiet text-accent transition-transform group-hover:scale-105">
            <Plus className="size-5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-semibold text-text">Новая сделка</span>
            <span className="block text-xs text-text-tertiary">Запрос, перевозка или щебень</span>
          </span>
        </Link>
        <Link
          href="/tariff"
          className="group flex items-center gap-3 rounded-lg border border-border bg-surface-1 px-5 py-6 transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out-quad)] hover:-translate-y-[2px] active:translate-y-0 active:opacity-90 focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-surface-2 text-text-secondary transition-colors group-hover:text-text">
            <Calculator className="size-5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-semibold text-text">Калькулятор</span>
            <span className="block text-xs text-text-tertiary">Тариф РЖД по станциям</span>
          </span>
        </Link>
        <Link
          href="/finances"
          className="group flex items-center gap-3 rounded-lg border border-border bg-surface-1 px-5 py-6 transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out-quad)] hover:-translate-y-[2px] active:translate-y-0 active:opacity-90 focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-surface-2 text-text-secondary transition-colors group-hover:text-text">
            <Wallet className="size-5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-semibold text-text">Финансы</span>
            <span className="block text-xs text-text-tertiary">Счета и движение денег</span>
          </span>
        </Link>
      </section>

      <section aria-label="Показатели" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Сделок в воронке" value={String(funnelCount)} href="/deals" />
        <StatTile
          label="Остаток на счетах"
          value={<Money value={totalBalance} />}
          variant="positive"
          href="/finances"
        />
        <StatTile
          label="Чистый поток за месяц"
          value={<Money value={netFlow} sign />}
          variant="accent"
          href="/finances"
        />
        <StatTile
          label="Писем требует проверки"
          value={String(quarantineCount)}
          {...(quarantineCount > 0 ? { variant: "negative" as const } : {})}
          href="/inbox"
        />
      </section>

      <section aria-labelledby="recent-deals-heading" className="rounded-lg border border-border bg-surface-1">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 id="recent-deals-heading" className="label-caps">
            Последние сделки
          </h2>
          {dealRows.length > 0 && (
            <Link href="/deals" className="text-xs text-accent hover:underline">
              Все сделки →
            </Link>
          )}
        </div>
        {recentDeals.length === 0 ? (
          <EmptyState
            icon={Handshake}
            title="Сделок пока нет"
            description="Сделка появляется из выигранного запроса или создаётся вручную."
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/deals/new">Создать сделку</Link>
              </Button>
            }
          />
        ) : (
          <ul>
            {recentDeals.map((r) => {
              const meta = dealStatusMeta(r.status);
              const headline = r.clientName ?? r.orderNumber ?? `Сделка ${r.id.slice(0, 8)}`;
              return (
                <li key={r.id} className="border-b border-border-subtle last:border-0">
                  <Link
                    href={`/deals/${r.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
                  >
                    <span className="min-w-0 truncate font-medium text-text">{headline}</span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs ${meta.tone}`}>
                        <span aria-hidden className="text-[0.7em] leading-none">
                          ●
                        </span>
                        {meta.label}
                      </span>
                      <span className="text-xs text-text-tertiary">
                        {dateFmt.format(new Date(r.createdAt))}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
