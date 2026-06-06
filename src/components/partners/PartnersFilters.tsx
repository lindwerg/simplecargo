import Link from "next/link";
import { Search } from "lucide-react";

import { inputClass } from "./form-primitives";

interface PartnersFiltersProps {
  search: string;
  /** active role tab — preserved across search submits via a hidden field */
  role: string;
}

/** URL-state search bar (GET form). Keeps the active role tab; shareable/bookmarkable. */
export function PartnersFilters({ search, role }: PartnersFiltersProps) {
  const hasSearch = search.length > 0;
  return (
    <form
      action="/partners"
      method="get"
      className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
    >
      {/* keep the active tab when submitting a search */}
      <input type="hidden" name="role" value={role} />

      <div className="relative flex-1 sm:max-w-xs">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-tertiary"
          aria-hidden
        />
        <input
          type="text"
          name="search"
          defaultValue={search}
          placeholder="Название, телефон, e-mail…"
          aria-label="Поиск партнёра"
          className={`${inputClass} pl-8`}
        />
      </div>

      <button
        type="submit"
        className="inline-flex h-11 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-surface-3 px-4 text-sm font-medium text-text transition-colors hover:bg-surface-2 focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] md:h-9"
      >
        Найти
      </button>
      {hasSearch && (
        <Link
          href={`/partners?role=${role}`}
          className="inline-flex h-11 items-center justify-center px-3 text-sm text-accent-text transition-colors hover:underline md:h-9"
        >
          Сбросить
        </Link>
      )}
    </form>
  );
}
