import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Archive, Handshake, Plus } from "lucide-react";

import { db } from "@/lib/db/client";
import { orders } from "@/lib/db/schema/orders";
import { counterparties } from "@/lib/db/schema/counterparties";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { dealStatusMeta } from "@/components/trades/dealStatusMeta";
import { DEAL_TYPE_LABEL } from "@/components/trades/dealTypeMeta";
import {
  DEAL_STAGES,
  QUOTE_STATUS_LABEL,
  isDealStage,
  stageForStatus,
  type DealStage,
} from "@/components/trades/dealStageMeta";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });

// Phase 0 skeleton: the unified «Сделки» list. Reads the existing `orders` spine
// (empty until deals are created in Phase 1) and counts attached transport directions.
// Сверху — воронка из трёх плашек (Запрос/Заявка/Исполнение); нажатие фильтрует список
// через URL `?stage=…` (без клиентского состояния, как DealTabs).
export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const { stage } = await searchParams;
  const activeStage: DealStage | null = isDealStage(stage) ? stage : null;
  const isArchive = stage === "archive";

  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      title: orders.title,
      dealType: orders.dealType,
      status: orders.status,
      quoteStatus: orders.quoteStatus,
      clientName: counterparties.nameCanonical,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .leftJoin(counterparties, eq(orders.clientSuggestedId, counterparties.id))
    .orderBy(desc(orders.createdAt));

  // Счётчики воронки и фильтрация — из уже загруженных строк, без новых запросов.
  // Архив = cancelled (вне воронки): не попадает в тайлы и в дефолтный список.
  const stageCounts = new Map<DealStage, number>();
  let archiveCount = 0;
  for (const r of rows) {
    const s = stageForStatus(r.status);
    if (s) stageCounts.set(s, (stageCounts.get(s) ?? 0) + 1);
    else if (r.status === "cancelled") archiveCount += 1;
  }

  const visibleRows = isArchive
    ? rows.filter((r) => r.status === "cancelled")
    : activeStage
      ? rows.filter((r) => stageForStatus(r.status) === activeStage)
      : rows.filter((r) => stageForStatus(r.status) !== null);
  const activeMeta = activeStage
    ? DEAL_STAGES.find((s) => s.stage === activeStage)
    : undefined;
  const emptyFilterLabel = isArchive ? "Архив" : activeMeta?.label;

  return (
    <div className="space-y-[var(--space-section)]">
      <header className="min-w-0">
        <p className="label-caps">Воронка</p>
        <h1 className="mt-1 break-words text-xl font-semibold tracking-tight text-text">Сделки</h1>
        <p className="mt-1 max-w-prose text-sm text-text-secondary">
          Единая карточка: запрос → заявка → исполнение. Перевозка, щебень или щебень с доставкой.
        </p>
      </header>

      <section aria-label="Действия" className="grid grid-cols-2 gap-3">
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
          href="/deals?stage=archive"
          className="group flex items-center gap-3 rounded-lg border border-border bg-surface-1 px-5 py-6 transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out-quad)] hover:-translate-y-[2px] active:translate-y-0 active:opacity-90 focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-surface-2 text-text-secondary transition-colors group-hover:text-text">
            <Archive className="size-5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-semibold text-text">Архив</span>
            <span className="block text-xs text-text-tertiary">Отменённые сделки</span>
          </span>
        </Link>
      </section>

      <section aria-label="Воронка" className="grid grid-cols-3 gap-3">
        {DEAL_STAGES.map(({ stage: s, label, subtitle }) => {
          const isActive = activeStage === s;
          const count = stageCounts.get(s) ?? 0;
          return (
            <Link
              key={s}
              href={isActive ? "/deals" : `/deals?stage=${s}`}
              aria-current={isActive ? "true" : undefined}
              className={`group flex flex-col gap-1 rounded-lg border px-4 py-5 transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out-quad)] hover:-translate-y-[2px] active:translate-y-0 active:opacity-90 focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)] ${
                isActive
                  ? "border-accent bg-accent-quiet"
                  : "border-border bg-surface-1"
              }`}
            >
              <span className="text-2xl font-bold leading-none tabular-nums text-text">
                {count}
              </span>
              <span className="mt-1 min-w-0">
                <span className="block truncate text-sm font-semibold text-text">{label}</span>
                <span className="block truncate text-xs text-text-tertiary">{subtitle}</span>
              </span>
            </Link>
          );
        })}
      </section>

      {(archiveCount > 0 || isArchive) && (
        <div className="-mt-2 flex items-center gap-3 text-xs">
          {isArchive ? (
            <>
              <span className="text-text-secondary">Архив · {archiveCount}</span>
              <Link href="/deals" className="text-accent hover:underline">
                ← к воронке
              </Link>
            </>
          ) : (
            <Link
              href="/deals?stage=archive"
              className="text-text-tertiary transition-colors hover:text-text"
            >
              Архив · {archiveCount}
            </Link>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface-1">
          <EmptyState
            icon={Handshake}
            title="Сделок пока нет"
            description="Сделка появляется из выигранного запроса или создаётся вручную для проактивной продажи."
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/deals/new">Создать сделку</Link>
              </Button>
            }
          />
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface-1 px-4 py-6 text-center text-sm text-text-secondary">
          {isArchive ? "В архиве пусто." : `На стадии «${emptyFilterLabel}» сделок нет.`}{" "}
          <Link href="/deals" className="text-accent hover:underline">
            {isArchive ? "← к воронке" : "Показать все"}
          </Link>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-border bg-surface-1">
          {visibleRows.map((r) => {
            const meta = dealStatusMeta(r.status);
            const headline = r.clientName ?? r.orderNumber ?? `Сделка ${r.id.slice(0, 8)}`;
            const typeLabel = r.dealType ? DEAL_TYPE_LABEL[r.dealType] : null;
            const konkretika = r.title ?? null;
            // Для сделок в стадии «Запрос» (draft) показываем под-статус просчёта.
            const quoteLabel = r.status === "draft" ? QUOTE_STATUS_LABEL[r.quoteStatus] : null;
            return (
              <li key={r.id} className="border-b border-border-subtle last:border-0">
                <Link
                  href={`/deals/${r.id}`}
                  className="flex flex-col gap-1.5 px-4 py-3 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 truncate font-medium text-text">{headline}</span>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 text-xs ${meta.tone}`}
                    >
                      <span aria-hidden className="text-[0.7em] leading-none">
                        ●
                      </span>
                      {meta.label}
                    </span>
                  </div>
                  {(typeLabel || konkretika) && (
                    <div className="flex min-w-0 items-center gap-2 text-sm text-text-secondary">
                      {typeLabel && (
                        <span className="inline-flex shrink-0 items-center rounded-pill bg-surface-2 px-2 py-0.5 text-xs text-text-secondary">
                          {typeLabel}
                        </span>
                      )}
                      {konkretika && <span className="truncate">{konkretika}</span>}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-tertiary">
                      {dateFmt.format(new Date(r.createdAt))}
                    </span>
                    {quoteLabel && (
                      <span className="text-xs text-accent">· {quoteLabel}</span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
