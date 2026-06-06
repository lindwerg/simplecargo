import { Money } from "@/components/ui/Money";
import type { DirectionPnlRow } from "@/lib/finances/repository";

interface DirectionPnlProps {
  rows: readonly DirectionPnlRow[];
}

/**
 * План-факт маржи по направлениям: плановая маржа (из сделок) против фактической
 * (разнесённые приходы − расходы), и дельта. Server Component.
 */
export function DirectionPnl({ rows }: DirectionPnlProps) {
  return (
    <ul className="divide-y divide-border-subtle">
      {rows.map((r) => (
        <li key={r.id} className="px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 truncate text-sm font-medium text-text">{r.name}</p>
            <span className="shrink-0 text-xs text-text-tertiary">{r.deals} сделок</span>
          </div>
          <div className="mt-1 grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-text-tertiary">План</p>
              <p className="mt-0.5 text-sm">
                <Money value={r.planMargin} form="short" />
              </p>
            </div>
            <div>
              <p className="text-text-tertiary">Факт</p>
              <p className="mt-0.5 text-sm">
                <Money value={r.factMargin} form="short" />
              </p>
            </div>
            <div>
              <p className="text-text-tertiary">Δ</p>
              <p className="mt-0.5 text-sm">
                <Money value={r.delta} form="short" sign />
              </p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
