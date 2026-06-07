import Link from "next/link";

import { cn } from "@/lib/utils";
import { INBOX_TABS, type InboxTabKey } from "./inbox-tabs";

export interface TabCount {
  total: number;
  unread: number;
}

interface InboxTabsProps {
  basePath: string;
  active: InboxTabKey;
  /** keyed by tab key ("all" | kind | "review") */
  counts: Record<string, TabCount | undefined>;
}

/** Горизонтальная лента вкладок «Входящих» (server). На каждой — всего писем
 *  (приглушённо) и «+N» новых (акцент). Скроллится на мобиле, переносится на ПК. */
export function InboxTabs({ basePath, active, counts }: InboxTabsProps) {
  return (
    <nav
      aria-label="Тип письма"
      className="flex w-full gap-1 overflow-x-auto rounded-[var(--radius-md)] bg-surface-1 p-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:flex-wrap [&::-webkit-scrollbar]:hidden"
    >
      {INBOX_TABS.map((t) => {
        const isActive = t.key === active;
        const c = counts[t.key];
        const total = c?.total ?? 0;
        const unread = c?.unread ?? 0;
        return (
          <Link
            key={t.key}
            href={`${basePath}?tab=${t.key}`}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-sm)] px-3 text-sm transition-colors duration-[var(--duration-fast)] focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] sm:h-9",
              isActive
                ? "bg-surface-3 text-text"
                : "text-text-secondary hover:bg-surface-2 hover:text-text",
            )}
            style={isActive ? { fontWeight: "var(--weight-semibold)" } : undefined}
          >
            <span>{t.label}</span>
            {total > 0 && <span className="text-2xs text-text-tertiary tabular-nums">{total}</span>}
            {unread > 0 && (
              <span className="num rounded-pill bg-accent px-1.5 text-2xs font-medium tabular-nums text-text-inverse">
                +{unread}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
