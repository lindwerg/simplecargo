import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { listDirectionCards } from "@/lib/requests/repository";
import { BoardView, type BoardViewMode } from "@/components/requests/BoardView";
import { BoardTabs } from "@/components/requests/BoardTabs";
import { BoardFilters } from "@/components/requests/BoardFilters";

export const dynamic = "force-dynamic";

const MODES = new Set<BoardViewMode>(["all", "clients", "origins", "roads"]);

type SP = Promise<{ view?: string; origin?: string; road?: string }>;

export default async function ArchiveBoardPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const view: BoardViewMode = MODES.has(sp.view as BoardViewMode) ? (sp.view as BoardViewMode) : "all";
  const originRaw = sp.origin?.trim() || undefined;
  const roadRaw = sp.road?.trim() || undefined;

  const cards = await listDirectionCards({
    bucket: "archive",
    originRaw,
    roadRaw,
    page: 1,
    pageSize: 100,
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href="/requests" className="inline-flex items-center gap-1 text-sm text-text-tertiary hover:text-text">
          <ArrowLeft className="size-4" aria-hidden /> Запросы
        </Link>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-xl text-text" style={{ fontWeight: "var(--weight-bold)" }}>
            Архив запросов
          </h1>
          <span className="font-mono text-sm tabular-nums text-text-secondary">
            {cards.length} направлений
          </span>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <BoardTabs basePath="/requests/archive" view={view} query={{ origin: originRaw, road: roadRaw }} />
        <BoardFilters basePath="/requests/archive" view={view} originRaw={originRaw} roadRaw={roadRaw} />
      </div>

      <BoardView cards={cards} view={view} archived />
    </div>
  );
}
