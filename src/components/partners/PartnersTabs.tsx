import Link from "next/link";

import { cn } from "@/lib/utils";

const TABS: { role: string; label: string }[] = [
  { role: "client", label: "Клиенты" },
  { role: "carrier", label: "Перевозчики" },
];

interface PartnersTabsProps {
  /** active role tab — "client" | "carrier" */
  role: string;
  /** preserved search query */
  search: string;
}

/** URL-state tabs splitting the partner book into Клиенты / Перевозчики. */
export function PartnersTabs({ role, search }: PartnersTabsProps) {
  const buildHref = (tabRole: string): string => {
    const params = new URLSearchParams();
    params.set("role", tabRole);
    if (search) params.set("search", search);
    return `/partners?${params.toString()}`;
  };

  return (
    <nav
      aria-label="Категория партнёров"
      className="flex w-full gap-1 overflow-x-auto rounded-[var(--radius-md)] bg-surface-1 p-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:w-auto sm:flex-wrap [&::-webkit-scrollbar]:hidden"
    >
      {TABS.map((t) => {
        const active = t.role === role;
        return (
          <Link
            key={t.role}
            href={buildHref(t.role)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-11 shrink-0 items-center whitespace-nowrap rounded-[var(--radius-sm)] px-4 text-sm transition-colors duration-[var(--duration-fast)] focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] sm:h-9",
              active
                ? "bg-surface-3 text-text"
                : "text-text-secondary hover:bg-surface-2 hover:text-text",
            )}
            style={active ? { fontWeight: "var(--weight-semibold)" } : undefined}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
