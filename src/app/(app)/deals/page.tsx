import Link from "next/link";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { Handshake, Plus } from "lucide-react";

import { db } from "@/lib/db/client";
import { orders } from "@/lib/db/schema/orders";
import { directions } from "@/lib/db/schema/directions";
import { counterparties } from "@/lib/db/schema/counterparties";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { dealStatusMeta } from "@/components/trades/dealStatusMeta";

export const dynamic = "force-dynamic";

// Phase 0 skeleton: the unified «Сделки» list. Reads the existing `orders` spine
// (empty until deals are created in Phase 1) and counts attached transport directions.
export default async function DealsPage() {
  const rows = await db
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

  const ids = rows.map((r) => r.id);
  const directionCounts = ids.length
    ? await db
        .select({ orderId: directions.orderId, count: sql<number>`count(*)::int` })
        .from(directions)
        .where(inArray(directions.orderId, ids))
        .groupBy(directions.orderId)
    : [];
  const countByOrder = new Map(directionCounts.map((d) => [d.orderId, d.count]));

  return (
    <div className="space-y-[var(--space-section)]">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-text">Сделки</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Единая карточка: запрос → заявка → исполнение. Перевозка, щебень или щебень с доставкой.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/deals/new">
              <Plus />
              Новая сделка
            </Link>
          </Button>
        </div>
      </header>

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
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface-1">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="label-caps px-4 py-2.5 font-medium">Сделка</th>
                <th className="label-caps px-4 py-2.5 font-medium">Клиент</th>
                <th className="label-caps px-4 py-2.5 text-right font-medium">Направлений</th>
                <th className="label-caps px-4 py-2.5 font-medium">Статус</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const meta = dealStatusMeta(r.status);
                return (
                  <tr key={r.id} className="border-b border-border-subtle last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/deals/${r.id}`}
                        className="text-text transition-colors hover:text-accent"
                      >
                        {r.orderNumber ?? `Сделка ${r.id.slice(0, 8)}`}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{r.clientName ?? "—"}</td>
                    <td className="px-4 py-3 text-right [font-variant-numeric:tabular-nums] text-text-secondary">
                      {countByOrder.get(r.id) ?? 0}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs ${meta.tone}`}>
                        <span aria-hidden className="text-[0.7em] leading-none">
                          ●
                        </span>
                        {meta.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
