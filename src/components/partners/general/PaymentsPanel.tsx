import { ArrowDownLeft, ArrowUpRight, Landmark, TriangleAlert } from "lucide-react";

import type { PartnerFinance } from "@/lib/partners/general";
import { Money } from "@/components/ui/Money";
import { StatTile } from "@/components/ui/StatTile";

function formatDate(d: Date | null): string {
  if (!d) return "—";
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("ru-RU");
}

/** Bank payments auto-matched to the partner by ИНН (Tochka). Read-only. Server Component. */
export function PaymentsPanel({ finance }: { finance: PartnerFinance }) {
  if (!finance.inn) {
    return (
      <section className="flex flex-col gap-3">
        <PanelHeader />
        <div className="flex items-start gap-2.5 rounded-[var(--radius-md)] border border-warn/40 bg-warn-quiet px-3 py-2.5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
          <p className="text-sm text-text-secondary">
            У контрагента не указан ИНН — платежи из Точки не привязываются автоматически.
            Добавьте ИНН в карточке («Изменить»), и платежи появятся здесь.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <PanelHeader bound lastAt={finance.lastPaymentAt} count={finance.count} />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-md)] border border-border bg-border sm:grid-cols-3">
        <StatTile label="Приход" value={<Money value={finance.totalIn} form="short" />} variant="positive" />
        <StatTile label="Расход" value={<Money value={finance.totalOut} form="short" />} variant="negative" />
        <StatTile label="Операций" value={String(finance.count)} className="col-span-2 sm:col-span-1" />
      </div>

      {finance.payments.length === 0 ? (
        <p className="text-sm text-text-tertiary">Платежей по этому ИНН пока нет.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {finance.payments.map((p) => {
            const isIn = p.direction === "in";
            return (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={`grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)] ${isIn ? "bg-success-quiet text-success" : "bg-danger-quiet text-danger"}`}
                  >
                    {isIn ? (
                      <ArrowDownLeft className="size-4" aria-hidden />
                    ) : (
                      <ArrowUpRight className="size-4" aria-hidden />
                    )}
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm text-text">
                      {p.purposeRaw ?? (isIn ? "Поступление" : "Списание")}
                    </span>
                    <span className="text-xs text-text-tertiary">{formatDate(p.postedAt)}</span>
                  </div>
                </div>
                <Money value={isIn ? p.amount : -p.amount} sign className="shrink-0 text-sm" />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function PanelHeader({ bound, lastAt, count }: { bound?: boolean; lastAt?: Date | null; count?: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Landmark className="size-4 text-text-tertiary" aria-hidden />
        <h2 className="text-md text-text" style={{ fontWeight: "var(--weight-semibold)" }}>
          Платежи (Точка)
        </h2>
      </div>
      {bound && (
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-success-quiet px-2.5 py-0.5 text-2xs font-medium text-success">
          <span className="size-1.5 rounded-full bg-success" aria-hidden />
          Привязка по ИНН активна
          {lastAt ? ` · ${formatDate(lastAt)}` : count === 0 ? " · нет операций" : ""}
        </span>
      )}
    </div>
  );
}
