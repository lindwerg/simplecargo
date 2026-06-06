import Link from "next/link";

import { Money } from "@/components/ui/Money";
import { cn } from "@/lib/utils";
import { abbreviateOrgName } from "@/lib/finances/org-name";
import type { TransactionRow } from "@/lib/finances/repository";

interface TransactionFeedProps {
  transactions: readonly TransactionRow[];
}

const dayFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });
const timeFmt = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function dayHeading(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const today = new Date();
  const startOf = (x: Date) => Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
  const diffDays = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  if (diffDays === 0) return "Сегодня";
  if (diffDays === 1) return "Вчера";
  return dayFmt.format(d);
}

// Deterministic avatar tint from the counterparty name (Tochka-like colored chip).
const AVATAR_TINTS = [
  "bg-info-quiet text-info",
  "bg-success-quiet text-success",
  "bg-warn-quiet text-warn",
  "bg-danger-quiet text-danger",
  "bg-accent-quiet text-accent-text",
] as const;

function avatarTint(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
}

function initial(name: string | null): string {
  const ch = name?.trim().replace(/^(ООО|АО|ПАО|ИП|ЗАО|ОАО)\s*["«]?/iu, "").trim()[0];
  return (ch ?? "?").toUpperCase();
}

function statusLabel(t: TransactionRow): string {
  if (t.status === "pending") return "В обработке";
  return t.direction === "in" ? "Зачислено" : "Исполнено";
}

function groupByDay(transactions: readonly TransactionRow[]): Array<[string, TransactionRow[]]> {
  const groups = new Map<string, TransactionRow[]>();
  for (const t of transactions) {
    const key = dayKey(t.postedAt);
    const bucket = groups.get(key);
    if (bucket) bucket.push(t);
    else groups.set(key, [t]);
  }
  return Array.from(groups.entries());
}

/**
 * Денежный поток в стиле Точки: операции сгруппированы по дате, у каждой —
 * цветной аватар контрагента, сумма со знаком, статус и время. Клик открывает
 * карточку операции с полными реквизитами. Server Component.
 */
export function TransactionFeed({ transactions }: TransactionFeedProps) {
  const groups = groupByDay(transactions);

  return (
    <div>
      {groups.map(([day, items]) => (
        <section key={day}>
          <h3 className="bg-surface-1 px-4 pb-1 pt-4 text-sm font-semibold text-text-secondary">
            {dayHeading(`${day}T00:00:00Z`)}
          </h3>
          <ul className="divide-y divide-border-subtle">
            {items.map((t) => {
              const incoming = t.direction === "in";
              const signed = incoming ? t.amount : -t.amount;
              const name = abbreviateOrgName(t.matchedName ?? t.counterpartyName);
              return (
                <li key={t.id}>
                  <Link
                    href={`/finances/tx/${t.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
                    style={{ minHeight: "var(--row-h)" }}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold",
                        avatarTint(name ?? t.id),
                      )}
                    >
                      {initial(name)}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text">
                        {name ?? (incoming ? "Поступление" : "Списание")}
                      </p>
                      <p className="truncate text-xs text-text-tertiary">
                        {t.purposeRaw ?? "—"}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      <Money value={signed} sign />
                      <span className="flex items-center gap-1.5 text-xs">
                        <span className="text-success">{statusLabel(t)}</span>
                        <span
                          className={cn(
                            "inline-block size-1.5 rounded-full",
                            t.linked ? "bg-success" : "bg-warn",
                          )}
                          title={t.linked ? "Разнесено" : "Не разнесено"}
                        />
                      </span>
                      <span className="text-xs text-text-tertiary">
                        {timeFmt.format(new Date(t.postedAt))}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
