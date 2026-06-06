import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

import { Money } from "@/components/ui/Money";
import type { DebtRow } from "@/lib/finances/repository";

interface DebtsProps {
  debts: DebtRow[];
}

function overdueBadge(days: number): { label: string; cls: string } | null {
  if (days <= 0) return null;
  if (days >= 30) return { label: `просрочка ${days} дн.`, cls: "bg-danger-quiet text-danger" };
  return { label: `просрочка ${days} дн.`, cls: "bg-warn-quiet text-warn" };
}

/** «Задолженности» — unsettled invoices, most-overdue first. incoming = мы должны,
 *  outgoing = нам должны. Server Component (read-only). */
export function Debts({ debts }: DebtsProps) {
  if (debts.length === 0) {
    return (
      <p className="text-sm text-text-tertiary">
        Открытых задолженностей нет — все счета оплачены или ещё не выставлены.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {debts.map((d) => {
        const badge = overdueBadge(d.daysOverdue);
        const isPayable = d.direction === "incoming";
        return (
          <li
            key={d.id}
            className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 py-2.5"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                {isPayable ? (
                  <ArrowUpRight className="size-3.5 shrink-0 text-money-neg" aria-label="мы должны" />
                ) : (
                  <ArrowDownLeft className="size-3.5 shrink-0 text-money-pos" aria-label="нам должны" />
                )}
                <span className="text-sm font-medium text-text">
                  {d.counterpartyName ?? d.counterpartyInn ?? "Контрагент не распознан"}
                </span>
                {badge && (
                  <span className={`rounded-pill px-2 py-0.5 text-2xs font-medium ${badge.cls}`}>
                    {badge.label}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-x-3 text-xs text-text-tertiary">
                <span>{isPayable ? "мы должны" : "нам должны"}</span>
                {d.invoiceNumber && <span>№ {d.invoiceNumber}</span>}
                {d.dueDate && <span>срок {new Date(d.dueDate).toLocaleDateString("ru-RU")}</span>}
                {d.counterpartyInn && <span>ИНН {d.counterpartyInn}</span>}
              </div>
            </div>
            {d.amountTotal != null && (
              <Money value={d.amountTotal} className="shrink-0 text-sm" />
            )}
          </li>
        );
      })}
    </ul>
  );
}
