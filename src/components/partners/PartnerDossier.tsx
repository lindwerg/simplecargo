import Link from "next/link";
import { FileSignature, Inbox, Route as RouteIcon, ScrollText, TrendingUp } from "lucide-react";

import type { PartnerDossier as Dossier } from "@/lib/partners/repository";

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

function money(n: number): string {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

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

/** Read-only "all deals by this company" view: requests, directions, deals, contracts. */
export function PartnerDossier({ dossier }: { dossier: Dossier }) {
  const { requests, directions, deals, dealsSummary, contracts, protocols } = dossier;

  return (
    <div className="flex flex-col gap-7">
      {deals.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryStat label="Сделок" value={String(dealsSummary.count)} />
          <SummaryStat label="Оборот (клиент), ₽" value={money(dealsSummary.totalRevenue)} />
          <SummaryStat label="Затраты (собств.), ₽" value={money(dealsSummary.totalCost)} />
          <SummaryStat label="Маржа, ₽" value={money(dealsSummary.totalMargin)} accent />
        </div>
      )}

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

      <SectionShell icon={<TrendingUp className="size-4" aria-hidden />} title="Сделки" count={deals.length}>
        <ul className="flex flex-col gap-2">
          {deals.map((d) => (
            <li key={d.id} className={rowClass}>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm text-text">
                  Вагон <span className="font-mono">{d.wagonNumber}</span> · {d.reportMonth}
                </span>
                <span className="text-xs text-text-tertiary">
                  {d.asClient && d.revenueUa !== null && `выручка ${money(d.revenueUa)} ₽`}
                  {d.asOwner && d.costOwner !== null && ` · затраты ${money(d.costOwner)} ₽`}
                  {d.margin !== null && ` · маржа ${money(d.margin)} ₽`}
                </span>
              </div>
              <StatusChip label={DEAL_STATUS_RU[d.status] ?? d.status} />
            </li>
          ))}
        </ul>
      </SectionShell>

      <SectionShell
        icon={<FileSignature className="size-4" aria-hidden />}
        title="Договоры и протоколы"
        count={contracts.length + protocols.length}
      >
        <ul className="flex flex-col gap-2">
          {contracts.map((c) => (
            <li key={c.id} className={rowClass}>
              <span className="inline-flex items-center gap-2 text-sm text-text">
                <ScrollText className="size-4 text-text-tertiary" aria-hidden />
                {c.contractRef}
              </span>
              {c.signedOn && (
                <span className="text-xs text-text-tertiary">
                  {new Date(c.signedOn).toLocaleDateString("ru-RU")}
                </span>
              )}
            </li>
          ))}
          {protocols.map((p) => (
            <li key={p.id} className={rowClass}>
              <span className="text-sm text-text">
                {p.protocolNumber ?? "ПСЦ"} ·{" "}
                <span className="text-text-secondary">
                  {p.side === "owner_cost" ? "затраты" : "выручка"}
                </span>
              </span>
              <StatusChip label={p.status === "active" ? "действует" : "заменён"} />
            </li>
          ))}
        </ul>
      </SectionShell>
    </div>
  );
}

function SummaryStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 py-2.5">
      <span className="label-caps">{label}</span>
      <span
        className="font-mono text-lg tabular-nums"
        style={{ color: accent ? "var(--color-accent)" : "var(--color-text)" }}
      >
        {value}
      </span>
    </div>
  );
}
