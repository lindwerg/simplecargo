import Link from "next/link";

import type { BoardViewMode } from "./BoardView";

interface BoardFiltersProps {
  basePath: string;
  view: BoardViewMode;
  originRaw?: string | undefined;
  roadRaw?: string | undefined;
}

const inputClass =
  "h-9 w-40 rounded-[var(--radius-md)] border border-border bg-surface-inset px-3 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]";

/** GET form — filters are URL state (shareable). No client JS. */
export function BoardFilters({ basePath, view, originRaw, roadRaw }: BoardFiltersProps) {
  const hasFilters = Boolean(originRaw || roadRaw);
  return (
    <form action={basePath} method="get" className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="view" value={view} />
      <input
        type="text"
        name="origin"
        defaultValue={originRaw ?? ""}
        placeholder="Станция отправления"
        aria-label="Фильтр по станции отправления"
        className={inputClass}
      />
      <input
        type="text"
        name="road"
        defaultValue={roadRaw ?? ""}
        placeholder="Дорога (СВР, КБШ…)"
        aria-label="Фильтр по дороге"
        className={inputClass}
      />
      <button
        type="submit"
        className="h-9 rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 text-sm text-text hover:bg-surface-3 focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
      >
        Фильтр
      </button>
      {hasFilters && (
        <Link
          href={`${basePath}?view=${view}`}
          className="h-9 leading-9 px-2 text-sm text-text-tertiary hover:text-text"
        >
          Сбросить
        </Link>
      )}
    </form>
  );
}
