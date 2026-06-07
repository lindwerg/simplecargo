import Link from "next/link";

import { cn } from "@/lib/utils";

/** The three lifecycle stages of a deal, surfaced as sub-tabs inside the deal card. */
export type DealTab = "request" | "application" | "execution";

const TABS: { tab: DealTab; label: string }[] = [
  { tab: "request", label: "Запрос" },
  { tab: "application", label: "Заявка" },
  { tab: "execution", label: "Исполнение" },
];

export function isDealTab(value: string | undefined): value is DealTab {
  return value === "request" || value === "application" || value === "execution";
}

interface DealTabsProps {
  /** Card route, e.g. `/deals/{id}`. */
  basePath: string;
  active: DealTab;
}

/**
 * Sub-tabs for the deal card. URL-query driven (`?tab=`) to match the project's
 * BoardTabs/PartnersTabs pattern — no client state, deep-linkable. Server Component.
 */
export function DealTabs({ basePath, active }: DealTabsProps) {
  return (
    <nav
      aria-label="Этапы сделки"
      className="flex w-full gap-1 overflow-x-auto rounded-[var(--radius-md)] bg-surface-1 p-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:w-auto [&::-webkit-scrollbar]:hidden"
    >
      {TABS.map((t) => {
        const isActive = t.tab === active;
        return (
          <Link
            key={t.tab}
            href={`${basePath}?tab=${t.tab}`}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex h-11 shrink-0 items-center whitespace-nowrap rounded-[var(--radius-sm)] px-4 text-sm transition-colors duration-[var(--duration-fast)] focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] sm:h-9",
              isActive
                ? "bg-surface-3 text-text"
                : "text-text-secondary hover:bg-surface-2 hover:text-text",
            )}
            style={isActive ? { fontWeight: "var(--weight-semibold)" } : undefined}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
