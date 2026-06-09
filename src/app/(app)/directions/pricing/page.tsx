import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";
import { ArrowLeft, FileSpreadsheet, Plus } from "lucide-react";
import { format } from "date-fns";

import { db } from "@/lib/db/client";
import { counterparties } from "@/lib/db/schema/counterparties";
import { priceProtocols, priceProtocolRates } from "@/lib/db/schema/pricing";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function sideLabel(side: string): string {
  return side === "owner_cost" ? "Затраты" : "Выручка";
}

export default async function PriceProtocolsPage() {
  const rows = await db
    .select({
      id: priceProtocols.id,
      protocolNumber: priceProtocols.protocolNumber,
      side: priceProtocols.side,
      status: priceProtocols.status,
      protocolDate: priceProtocols.protocolDate,
      counterpartyName: counterparties.nameCanonical,
      rateCount: count(priceProtocolRates.id),
    })
    .from(priceProtocols)
    .leftJoin(counterparties, eq(priceProtocols.counterpartyId, counterparties.id))
    .leftJoin(priceProtocolRates, eq(priceProtocolRates.protocolId, priceProtocols.id))
    .groupBy(
      priceProtocols.id,
      priceProtocols.protocolNumber,
      priceProtocols.side,
      priceProtocols.status,
      priceProtocols.protocolDate,
      counterparties.nameCanonical,
    )
    .orderBy(desc(priceProtocols.createdAt));

  return (
    <div className="space-y-[var(--space-section)]">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/deals"
            className="inline-flex items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-text"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Направления
          </Link>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-text">Ставки ПСЦ</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Согласованные протоколы цен — таблицы ставок, против которых направления резолвят
            затраты и выручку.
          </p>
        </div>
        <Button asChild>
          <Link href="/directions/pricing/new">
            <Plus />
            Новый протокол ПСЦ
          </Link>
        </Button>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface-1">
          <EmptyState
            icon={FileSpreadsheet}
            title="Протоколов пока нет"
            description="Заведите первый ПСЦ, чтобы направления могли резолвить ставки."
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/directions/pricing/new">Создать протокол</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface-1">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="label-caps px-4 py-2.5 font-medium">Протокол</th>
                <th className="label-caps px-4 py-2.5 font-medium">Контрагент</th>
                <th className="label-caps px-4 py-2.5 font-medium">Сторона</th>
                <th className="label-caps px-4 py-2.5 text-right font-medium">Строк</th>
                <th className="label-caps px-4 py-2.5 font-medium">Дата</th>
                <th className="label-caps px-4 py-2.5 font-medium">Статус</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const superseded = r.status === "superseded";
                return (
                  <tr
                    key={r.id}
                    className={cn(
                      "border-b border-border-subtle last:border-0",
                      superseded && "opacity-60",
                    )}
                  >
                    <td className="px-4 py-3 text-text">{r.protocolNumber ?? "Без номера"}</td>
                    <td className="px-4 py-3 text-text-secondary">{r.counterpartyName ?? "—"}</td>
                    <td className="px-4 py-3 text-text-secondary">{sideLabel(r.side)}</td>
                    <td className="px-4 py-3 text-right [font-variant-numeric:tabular-nums] text-text-secondary">
                      {r.rateCount}
                    </td>
                    <td className="px-4 py-3 text-text-tertiary">
                      {r.protocolDate ? format(r.protocolDate, "dd.MM.yyyy") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 text-xs",
                          superseded ? "text-text-tertiary" : "text-success",
                        )}
                      >
                        <span aria-hidden className="text-[0.7em] leading-none">
                          {superseded ? "✕" : "●"}
                        </span>
                        {superseded ? "Заменён" : "Активен"}
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
