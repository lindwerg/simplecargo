import { cn } from "@/lib/utils";
import { Money } from "@/components/ui/Money";
import { StatusPill, type RequestStatus } from "@/components/ui/StatusPill";
import type { DirectionCardView } from "@/lib/requests/grouping";

interface RequestCardProps {
  card: DirectionCardView;
  archived?: boolean | undefined;
}

const MS_PER_DAY = 86_400_000;

function slaChip(validUntil: Date | null): { label: string; tone: string } | null {
  if (!validUntil) return null;
  const days = Math.ceil((validUntil.getTime() - Date.now()) / MS_PER_DAY);
  if (days < 0) return { label: "просрочен", tone: "text-danger" };
  if (days === 0) return { label: "сегодня", tone: "text-danger" };
  if (days <= 2) return { label: `${days} дн`, tone: "text-warn" };
  return { label: `${days} дн`, tone: "text-text-tertiary" };
}

/** Marketplace-style direction card (one request_line). Server Component — pure
 *  display. The whole card links to the parent request's detail. */
export function RequestCard({ card, archived = false }: RequestCardProps) {
  const status = card.status as RequestStatus;
  const clientLabel = card.clientName ?? card.clientRaw;
  const isTemp = !card.clientSuggestedId;
  const sla = slaChip(card.validUntil);

  return (
    <article
      className={cn(
        "direction-card flex flex-col",
        `direction-card--${status}`,
        archived && "direction-card--archived",
      )}
    >
      {/* status + SLA */}
      <div className="flex items-center justify-between px-4 pt-3">
        <StatusPill status={status} />
        {sla && (
          <span className={cn("font-mono text-xs tabular-nums", sla.tone)}>SLA {sla.label}</span>
        )}
      </div>

      {/* route hero */}
      <div className="min-w-0 px-4 pt-3">
        <div className="flex min-w-0 items-baseline gap-1.5 text-lg leading-tight" style={{ fontWeight: "var(--weight-semibold)" }}>
          <span className="min-w-0 truncate text-text" title={card.originRaw}>
            {card.originRaw}
          </span>
          <span aria-hidden className="shrink-0 text-accent">→</span>
          <span className="min-w-0 truncate text-text" title={card.destRaw}>
            {card.destRaw}
          </span>
        </div>
        {(card.originRoadRaw || card.destRoadRaw) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {card.originRoadRaw && <RoadTag label={card.originRoadRaw} />}
            {card.originRoadRaw && card.destRoadRaw && (
              <span aria-hidden className="text-2xs text-text-disabled">→</span>
            )}
            {card.destRoadRaw && <RoadTag label={card.destRoadRaw} />}
          </div>
        )}
      </div>

      {/* cargo */}
      <p className="line-clamp-2 px-4 pt-2 text-sm text-text-secondary">
        {[card.wagonType, card.cargoName].filter(Boolean).join(" · ") || "груз не указан"}
      </p>

      {/* metrics: wagons (quantity) + target rate (price) */}
      <div className="mt-3 flex items-stretch gap-3 px-4">
        <div className="flex flex-col justify-center">
          <span
            className="font-mono leading-none text-text tabular-nums slashed-zero"
            style={{ fontSize: "2rem", fontWeight: "var(--weight-bold)" }}
          >
            {card.wagonsRequested}
          </span>
          <span className="mt-1 text-2xs text-text-tertiary">вагонов</span>
        </div>
        <div className="w-px self-stretch bg-border-subtle" aria-hidden />
        <div className="flex flex-1 flex-col justify-center rounded-[var(--radius-md)] bg-accent-quiet px-3 py-1.5">
          <span className="label-caps">Желаемая ставка</span>
          {card.targetRatePerWagon != null ? (
            <Money value={card.targetRatePerWagon} form="per-wagon" className="text-md" />
          ) : card.targetRateRaw ? (
            <span className="font-mono text-sm text-text tabular-nums">{card.targetRateRaw}</span>
          ) : (
            <span className="text-sm text-text-disabled">не указана</span>
          )}
        </div>
      </div>

      {/* footer: tonnage + client */}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border-subtle px-4 py-2.5">
        <span className="text-xs text-text-secondary tabular-nums">
          {card.tonnagePerWagon != null ? `${card.tonnagePerWagon} т/ваг` : "тоннаж —"}
        </span>
        {clientLabel ? (
          <span className="flex min-w-0 items-center gap-1.5">
            {isTemp && (
              <span
                className="shrink-0 rounded-pill bg-warn-quiet px-1.5 py-0.5 text-2xs font-medium text-warn"
                title="Временный клиент — не привязан к контрагенту"
              >
                врем.
              </span>
            )}
            <span className="truncate text-xs text-text-secondary" title={clientLabel}>
              {clientLabel}
            </span>
          </span>
        ) : (
          <span className="text-xs text-text-disabled">клиент не задан</span>
        )}
      </div>

      {/* full-card link — deep-links to THIS direction (worklist auto-scrolls +
          preselects it via #line-{lineId}), without changing the route target. */}
      <a
        href={`/requests/${card.requestId}#line-${card.lineId}`}
        className="absolute inset-0 rounded-[var(--radius-lg)] focus:outline-none"
        aria-label={`Запрос ${card.requestNumber ?? ""}: ${card.originRaw} → ${card.destRaw}, ${card.wagonsRequested} вагонов`}
      />
    </article>
  );
}

function RoadTag({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center rounded-pill bg-surface-3 px-2 py-0.5 text-2xs font-medium uppercase text-text-tertiary"
      style={{ letterSpacing: "var(--tracking-caps)" }}
    >
      {label}
    </span>
  );
}
