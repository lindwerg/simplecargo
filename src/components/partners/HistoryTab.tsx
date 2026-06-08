import Link from "next/link";
import { Briefcase, Inbox, Route as RouteIcon, TrendingUp } from "lucide-react";

import type { PartnerDossier as Dossier } from "@/lib/partners/repository";
import { Money } from "@/components/ui/Money";

const REQUEST_STATUS_RU: Record<string, string> = {
  new: "новый",
  sourcing: "опрос",
  quoted: "котировка",
  won: "выигран",
  lost: "проигран",
  no_bid: "без ставки",
  expired: "истёк",
  cancelled: "отменён",
};

const ORDER_STATUS_RU: Record<string, string> = {
  draft: "просчёт",
  confirmed: "заявка",
  active: "в работе",
  completed: "завершена",
  cancelled: "отменена",
};

const ORDER_QUOTE_RU: Record<string, string> = {
  quoting: "просчёт",
  quoted: "КП дано",
  won: "выиграна",
};

const DIRECTION_STATUS_RU: Record<string, string> = {
  draft: "черновик",
  open: "открыто",
  active: "активно",
  paused: "пауза",
  completed: "завершено",
  cancelled: "отменено",
};

const DEAL_STATUS_RU: Record<string, string> = {
  OPEN: "открыта",
  ACTIVE: "активна",
  COMPLETE: "завершена",
  CONFLICT: "конфликт",
  ABANDONED: "отменена",
};

function StatusChip({ label }: { label: string }) {
  return (
    <span className="shrink-0 rounded-pill bg-surface-3 px-2 py-0.5 text-2xs font-medium text-text-secondary">
      {label}
    </span>
  );
}

function SectionShell({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <header className="flex items-center gap-2">
        <span className="text-text-tertiary">{icon}</span>
        <h2 className="text-md text-text" style={{ fontWeight: "var(--weight-semibold)" }}>
          {title}
        </h2>
        <span className="font-mono text-xs tabular-nums text-text-tertiary">{count}</span>
      </header>
      {count === 0 ? <p className="text-sm text-text-tertiary">Пусто.</p> : children}
    </section>
  );
}

const rowClass =
  "flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 py-2.5 transition-colors hover:bg-surface-3";

/** «История»: запросы, заявки, направления и отгрузки контрагента. */
export function HistoryTab({ dossier }: { dossier: Dossier }) {
  const { requests, orders, directions, deals } = dossier;

  if (
    requests.length === 0 &&
    orders.length === 0 &&
    directions.length === 0 &&
    deals.length === 0
  ) {
    return (
      <div className="rounded-[var(--radius-md)] border border-dashed border-border bg-surface-1 px-4 py-10 text-center">
        <p className="text-sm text-text-secondary">По контрагенту пока нет истории.</p>
        <p className="mt-1 text-xs text-text-tertiary">
          Запросы, заявки, направления и отгрузки появятся здесь автоматически.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      <SectionShell icon={<Inbox className="size-4" aria-hidden />} title="Запросы" count={requests.length}>
        <ul className="flex flex-col gap-2">
          {requests.map((r) => (
            <li key={r.id}>
              <Link href={`/requests/${r.id}`} className={rowClass}>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm text-text">
                    {r.requestNumber ?? "Запрос"}
                    {r.clientRaw ? ` · ${r.clientRaw}` : ""}
                  </span>
                  <span className="text-xs text-text-tertiary">{r.linesCount} направл.</span>
                </div>
                <StatusChip label={REQUEST_STATUS_RU[r.status] ?? r.status} />
              </Link>
            </li>
          ))}
        </ul>
      </SectionShell>

      <SectionShell icon={<Briefcase className="size-4" aria-hidden />} title="Заявки" count={orders.length}>
        <ul className="flex flex-col gap-2">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/deals/${o.id}`} className={rowClass}>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm text-text">
                    {o.title ?? o.orderNumber ?? "Заявка"}
                  </span>
                  <span className="text-xs text-text-tertiary">
                    {new Date(o.createdAt).toLocaleDateString("ru-RU")}
                  </span>
                </div>
                <StatusChip
                  label={
                    o.status === "draft"
                      ? (ORDER_QUOTE_RU[o.quoteStatus] ?? o.quoteStatus)
                      : (ORDER_STATUS_RU[o.status] ?? o.status)
                  }
                />
              </Link>
            </li>
          ))}
        </ul>
      </SectionShell>

      <SectionShell icon={<RouteIcon className="size-4" aria-hidden />} title="Направления" count={directions.length}>
        <ul className="flex flex-col gap-2">
          {directions.map((d) => (
            <li key={d.id}>
              <Link href={`/directions/${d.id}`} className={rowClass}>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm text-text">
                    {d.displayName ?? `${d.originRaw ?? "?"} → ${d.destRaw ?? "?"}`}
                  </span>
                  <span className="text-xs text-text-tertiary">
                    {d.asClient && "как клиент"}
                    {d.asClient && d.asOwner && " · "}
                    {d.asOwner && "как собственник"}
                    {d.wagonCountPlanned ? ` · ${d.wagonCountPlanned} ваг` : ""}
                  </span>
                </div>
                <StatusChip label={DIRECTION_STATUS_RU[d.status] ?? d.status} />
              </Link>
            </li>
          ))}
        </ul>
      </SectionShell>

      <SectionShell icon={<TrendingUp className="size-4" aria-hidden />} title="Отгрузки" count={deals.length}>
        <ul className="flex flex-col gap-2">
          {deals.map((d) => (
            <li key={d.id} className={rowClass}>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm text-text">
                  Вагон <span className="font-mono">{d.wagonNumber}</span> · {d.reportMonth}
                </span>
                <span className="flex flex-wrap gap-x-2 text-xs text-text-tertiary">
                  {d.asClient && d.revenueUa !== null && (
                    <span>
                      выручка <Money value={d.revenueUa} form="short" className="text-xs" />
                    </span>
                  )}
                  {d.asOwner && d.costOwner !== null && (
                    <span>
                      затраты <Money value={d.costOwner} form="short" className="text-xs" />
                    </span>
                  )}
                  {d.margin !== null && (
                    <span>
                      маржа <Money value={d.margin} form="short" sign className="text-xs" />
                    </span>
                  )}
                </span>
              </div>
              <StatusChip label={DEAL_STATUS_RU[d.status] ?? d.status} />
            </li>
          ))}
        </ul>
      </SectionShell>
    </div>
  );
}
