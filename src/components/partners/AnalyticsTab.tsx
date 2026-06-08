import { Mountain } from "lucide-react";

import type { PartnerAnalytics } from "@/lib/partners/analytics";
import { Money } from "@/components/ui/Money";
import { StatTile } from "@/components/ui/StatTile";

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const months = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  const idx = Number(m) - 1;
  return `${months[idx] ?? m} ${(y ?? "").slice(2)}`;
}

function tonnage(n: number): string {
  return `${n.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} т`;
}

/** «Аналитика по отгрузкам» — роль-адаптивные KPI + помесячный график + щебень для карьеров. */
export function AnalyticsTab({
  analytics,
  roles,
}: {
  analytics: PartnerAnalytics;
  roles: readonly string[];
}) {
  const isClient = roles.includes("client") || analytics.asClientCount > 0;
  const isOwnerSide =
    roles.includes("owner") || roles.includes("carrier") || analytics.asOwnerCount > 0;

  if (analytics.dealsCount === 0 && (!analytics.stone || analytics.stone.linesCount === 0)) {
    return (
      <div className="rounded-[var(--radius-md)] border border-dashed border-border bg-surface-1 px-4 py-10 text-center">
        <p className="text-sm text-text-secondary">Отгрузок по контрагенту пока нет.</p>
        <p className="mt-1 text-xs text-text-tertiary">
          Аналитика появится, как только пойдут отгрузки.
        </p>
      </div>
    );
  }

  const maxRevenue = Math.max(1, ...analytics.monthly.map((m) => Math.max(m.revenue, m.cost)));

  return (
    <div className="flex flex-col gap-7">
      <section
        aria-label="Показатели"
        className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-md)] border border-border bg-border lg:grid-cols-4"
      >
        <StatTile label="Отгрузок (вагонов)" value={String(analytics.dealsCount)} />
        {isClient && (
          <>
            <StatTile label="Выручка" value={<Money value={analytics.totalRevenue} form="short" />} variant="accent" />
            <StatTile label="Маржа" value={<Money value={analytics.totalMargin} form="short" sign />} variant="positive" />
          </>
        )}
        {isOwnerSide && (
          <StatTile label="Затраты" value={<Money value={analytics.totalCost} form="short" />} variant="negative" />
        )}
        <StatTile
          label="Оборачиваемость"
          value={analytics.avgTurnoverDays != null ? `${analytics.avgTurnoverDays} дн` : "—"}
          hint="средн. по рейсам"
        />
      </section>

      {analytics.monthly.length > 0 && (
        <section aria-labelledby="monthly-heading" className="rounded-lg border border-border bg-surface-1">
          <div className="border-b border-border px-4 py-3">
            <h2 id="monthly-heading" className="label-caps">
              По месяцам
            </h2>
          </div>
          <div className="flex flex-col gap-3 px-4 py-4">
            {analytics.monthly.map((m) => {
              const primary = isClient ? m.revenue : m.cost;
              const pct = Math.round((primary / maxRevenue) * 100);
              return (
                <div key={m.month} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-xs text-text-tertiary">{monthLabel(m.month)}</span>
                  <div className="h-5 flex-1 overflow-hidden rounded-[var(--radius-sm)] bg-surface-2">
                    <div
                      className="h-full rounded-[var(--radius-sm)] bg-accent/70"
                      style={{ width: `${Math.max(pct, primary > 0 ? 3 : 0)}%` }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right">
                    <Money value={primary} form="short" className="text-xs" />
                  </span>
                  <span className="w-10 shrink-0 text-right font-mono text-2xs tabular-nums text-text-tertiary">
                    {m.deals} ваг
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {analytics.stone && analytics.stone.linesCount > 0 && (
        <section aria-labelledby="stone-heading" className="rounded-lg border border-border bg-surface-1">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Mountain className="size-4 text-text-tertiary" aria-hidden />
            <h2 id="stone-heading" className="label-caps">
              Поставки щебня
            </h2>
          </div>
          <div className="grid grid-cols-3 gap-px overflow-hidden bg-border">
            <StatTile label="Позиций" value={String(analytics.stone.linesCount)} />
            <StatTile label="Отгружено" value={tonnage(analytics.stone.tonnage)} />
            <StatTile label="Закупка" value={<Money value={analytics.stone.purchaseAmount} form="short" />} variant="negative" />
          </div>
        </section>
      )}
    </div>
  );
}
