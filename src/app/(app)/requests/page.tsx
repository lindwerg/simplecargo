import Link from "next/link";
import { Archive, Plus } from "lucide-react";

import { listDirectionCards } from "@/lib/requests/repository";
import { BoardView, type BoardViewMode } from "@/components/requests/BoardView";
import { BoardSelection } from "@/components/requests/BoardSelection";
import { BoardTabs } from "@/components/requests/BoardTabs";
import { BoardFilters } from "@/components/requests/BoardFilters";
import { LiveRefresh } from "@/components/realtime/LiveRefresh";

export const dynamic = "force-dynamic";

const MODES = new Set<BoardViewMode>(["all", "clients", "origins", "roads"]);

type SP = Promise<{ view?: string; origin?: string; road?: string }>;

export default async function RequestsBoardPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const view: BoardViewMode = MODES.has(sp.view as BoardViewMode) ? (sp.view as BoardViewMode) : "all";
  const originRaw = sp.origin?.trim() || undefined;
  const roadRaw = sp.road?.trim() || undefined;

  const cards = await listDirectionCards({
    bucket: "active",
    originRaw,
    roadRaw,
    page: 1,
    pageSize: 100,
  });

  return (
    <div className="flex flex-col gap-6">
      <LiveRefresh />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl text-text" style={{ fontWeight: "var(--weight-bold)" }}>
            Запросы
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Актуальные направления в работе. Группировка по клиентам, станциям и дорогам.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/requests/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] bg-accent px-3 text-sm font-semibold text-text-inverse transition-colors duration-[var(--duration-fast)] hover:bg-accent-hover focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
          >
            <Plus className="size-4" aria-hidden strokeWidth={2.2} />
            Создать
          </Link>
          <Link
            href="/requests/archive"
            className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] bg-surface-3 px-3 text-sm font-medium text-text transition-colors duration-[var(--duration-fast)] hover:bg-surface-2 focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
          >
            <Archive className="size-4" aria-hidden strokeWidth={1.8} />
            Архив
          </Link>
        </div>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <BoardTabs basePath="/requests" view={view} query={{ origin: originRaw, road: roadRaw }} />
        <BoardFilters basePath="/requests" view={view} originRaw={originRaw} roadRaw={roadRaw} />
      </div>

      {cards.length === 0 ? (
        <BoardView cards={cards} view={view} />
      ) : (
        <BoardSelection cards={cards} view={view} />
      )}
    </div>
  );
}
