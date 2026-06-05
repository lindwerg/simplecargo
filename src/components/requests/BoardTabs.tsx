import Link from "next/link";

import { cn } from "@/lib/utils";
import type { BoardViewMode } from "./BoardView";

const TABS: { mode: BoardViewMode; label: string }[] = [
  { mode: "all", label: "Все" },
  { mode: "clients", label: "По клиентам" },
  { mode: "origins", label: "По станциям" },
  { mode: "roads", label: "По дорогам" },
];

interface BoardTabsProps {
  basePath: string;
  view: BoardViewMode;
  /** preserved query params (origin/road filters) */
  query?: Record<string, string | undefined>;
}

export function BoardTabs({ basePath, view, query = {} }: BoardTabsProps) {
  const buildHref = (mode: BoardViewMode): string => {
    const params = new URLSearchParams();
    params.set("view", mode);
    for (const [k, v] of Object.entries(query)) if (v) params.set(k, v);
    return `${basePath}?${params.toString()}`;
  };

  return (
    <nav aria-label="Группировка запросов" className="flex flex-wrap gap-1 rounded-[var(--radius-md)] bg-surface-1 p-1">
      {TABS.map((t) => {
        const active = t.mode === view;
        return (
          <Link
            key={t.mode}
            href={buildHref(t.mode)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-[var(--radius-sm)] px-3 py-1.5 text-sm transition-colors duration-[var(--duration-fast)] focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]",
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
