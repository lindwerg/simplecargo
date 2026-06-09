import Link from "next/link";
import { BarChart3, FileText, Wallet } from "lucide-react";

import { EmptyState } from "@/components/ui/EmptyState";

// Placeholder shell — the Отчётность ПВ table + xlsx export ships in P1.5.
export default function ReportsPage() {
  return (
    <div className="space-y-[var(--space-section)]">
      <header className="min-w-0">
        <p className="label-caps">Аналитика</p>
        <h1 className="mt-1 break-words text-xl font-semibold tracking-tight text-text">
          Отчётность
        </h1>
        <p className="mt-1 max-w-prose text-sm text-text-secondary">
          Отчёты по перевозкам и деньгам: выписки, план-факт по направлениям.
        </p>
      </header>

      <section aria-label="Действия" className="grid grid-cols-2 gap-3">
        <Link
          href="/finances/statement"
          className="group flex items-center gap-3 rounded-lg border border-border bg-surface-1 px-5 py-6 transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out-quad)] hover:-translate-y-[2px] active:translate-y-0 active:opacity-90 focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent-quiet text-accent transition-transform group-hover:scale-105">
            <FileText className="size-5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-semibold text-text">Выписка по счёту</span>
            <span className="block text-xs text-text-tertiary">Скачать за период</span>
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
            <span className="block text-base font-semibold text-text">План-факт</span>
            <span className="block text-xs text-text-tertiary">Экономика по направлениям</span>
          </span>
        </Link>
      </section>

      <section className="rounded-lg border border-border bg-surface-1">
        <EmptyState
          icon={BarChart3}
          title="Отчётность ПВ в разработке"
          description="Сводная таблица по вагонам и xlsx-экспорт появятся следующим этапом."
        />
      </section>
    </div>
  );
}
