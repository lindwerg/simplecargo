import Link from "next/link";
import { Search } from "lucide-react";

import { PARTNER_ROLES, ROLE_LABELS_RU } from "@/lib/partners/schema";
import { inputClass } from "./form-primitives";

interface PartnersFiltersProps {
  search: string;
  role: string;
}

/** URL-state filter bar (GET form) — search + role. Shareable/bookmarkable. */
export function PartnersFilters({ search, role }: PartnersFiltersProps) {
  const hasFilters = search.length > 0 || role.length > 0;
  return (
    <form
      action="/partners"
      method="get"
      className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
    >
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

      <select name="role" defaultValue={role} aria-label="Роль" className={`${inputClass} sm:w-48`}>
        <option value="">Все роли</option>
        {PARTNER_ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS_RU[r]}
          </option>
        ))}
      </select>

      <button
        type="submit"
        className="inline-flex h-11 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-surface-3 px-4 text-sm font-medium text-text transition-colors hover:bg-surface-2 focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] md:h-9"
      >
        Фильтр
      </button>
      {hasFilters && (
        <Link
          href="/partners"
          className="inline-flex h-11 items-center justify-center px-3 text-sm text-accent-text transition-colors hover:underline md:h-9"
        >
          Сбросить
        </Link>
      )}
    </form>
  );
}
