import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

import { Money } from "@/components/ui/Money";
import { cn } from "@/lib/utils";
import type { TransactionRow } from "@/lib/finances/repository";

interface TransactionFeedProps {
  transactions: readonly TransactionRow[];
}

const dateFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d);
}

/**
 * Денежный поток — одна операция на строку: направление (стрелка + знак-цвет),
 * сумма, контрагент (от кого/кому) + ИНН, назначение, и бейдж разнесения.
 * Server Component.
 */
export function TransactionFeed({ transactions }: TransactionFeedProps) {
  return (
    <ul className="divide-y divide-border-subtle">
      {transactions.map((t) => {
        const incoming = t.direction === "in";
        const Arrow = incoming ? ArrowDownLeft : ArrowUpRight;
        const signed = incoming ? t.amount : -t.amount;
        return (
          <li
            key={t.id}
            className="flex items-center gap-3 px-4 py-3"
            style={{ minHeight: "var(--row-h)" }}
          >
            <span
              aria-hidden
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-full",
                incoming ? "bg-success-quiet text-success" : "bg-danger-quiet text-danger",
              )}
            >
              <Arrow className="size-4" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text">
                {t.counterpartyName ?? (incoming ? "Поступление" : "Списание")}
              </p>
              <p className="truncate text-xs text-text-tertiary">
                {t.counterpartyInn ? `ИНН ${t.counterpartyInn} · ` : ""}
                {t.purposeRaw ?? "—"}
              </p>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-0.5">
              <Money value={signed} sign />
              <span className="flex items-center gap-1.5 text-xs text-text-tertiary">
                <span>{formatDate(t.postedAt)}</span>
                <span
                  className={cn(
                    "inline-block size-1.5 rounded-full",
                    t.linked ? "bg-success" : "bg-warn",
                  )}
                  title={t.linked ? "Разнесено" : "Не разнесено"}
                  aria-label={t.linked ? "Разнесено" : "Не разнесено"}
                />
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
