import { Archive, Inbox } from "lucide-react";

import { EmptyState } from "@/components/ui/EmptyState";
import { RequestCard } from "./RequestCard";
import {
  groupByClient,
  groupByOriginStation,
  groupByRoad,
  sortByCreatedAt,
  type DirectionCardView,
  type Group,
} from "@/lib/requests/grouping";

export type BoardViewMode = "all" | "clients" | "origins" | "roads";

interface BoardViewProps {
  cards: DirectionCardView[];
  view: BoardViewMode;
  archived?: boolean | undefined;
}

function CardGrid({ cards, archived }: { cards: DirectionCardView[]; archived?: boolean | undefined }) {
  return (
    <div className="direction-card-grid">
      {cards.map((c) => (
        <RequestCard key={c.lineId} card={c} archived={archived} />
      ))}
    </div>
  );
}

function GroupSection({ group, archived }: { group: Group; archived?: boolean | undefined }) {
  return (
    <section aria-label={group.label} className="flex flex-col gap-3">
      <header className="flex items-center justify-between gap-4 border-b border-border-strong pb-2">
        <div className="flex min-w-0 items-center gap-2">
          {group.isTemp && (
            <span className="shrink-0 rounded-pill bg-warn-quiet px-1.5 py-0.5 text-2xs font-medium uppercase text-warn">
              врем.
            </span>
          )}
          <h2 className="truncate text-md text-text" style={{ fontWeight: "var(--weight-semibold)" }}>
            {group.label}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-4 font-mono text-xs tabular-nums text-text-secondary">
          <span>{group.cardCount} напр.</span>
          <span className="text-text">{group.totalWagons} ваг</span>
        </div>
      </header>
      <CardGrid cards={group.items} archived={archived} />
    </section>
  );
}

export function BoardView({ cards, view, archived = false }: BoardViewProps) {
  if (cards.length === 0) {
    return (
      <EmptyState
        icon={archived ? Archive : Inbox}
        title={archived ? "Архив пуст" : "Запросов пока нет"}
        description={
          archived
            ? "Сюда попадают завершённые запросы: выигранные, проигранные, отменённые."
            : "Создайте первый запрос — загрузите план клиента, вставьте текст или надиктуйте голосом."
        }
      />
    );
  }

  if (view === "all") {
    return <CardGrid cards={sortByCreatedAt(cards)} archived={archived} />;
  }

  const groups =
    view === "clients"
      ? groupByClient(cards)
      : view === "origins"
        ? groupByOriginStation(cards)
        : groupByRoad(cards);

  return (
    <div className="flex flex-col gap-8">
      {groups.map((g) => (
        <GroupSection key={g.key} group={g} archived={archived} />
      ))}
    </div>
  );
}
