import Link from "next/link";

import { cn } from "@/lib/utils";

/** Sub-tabs inside the partner card. `materials` only shows for quarry partners. */
export type PartnerTab = "general" | "contract" | "history" | "analytics" | "materials";

interface TabDef {
  tab: PartnerTab;
  label: string;
  /** When set, the tab only appears if the partner holds one of these roles. */
  requiresRole?: string[];
}

const TABS: TabDef[] = [
  { tab: "general", label: "Общая информация" },
  { tab: "contract", label: "Договор" },
  { tab: "history", label: "История" },
  { tab: "analytics", label: "Аналитика" },
  { tab: "materials", label: "Щебень", requiresRole: ["quarry"] },
];

/** Resolve the visible tab set for a partner's roles (union, materials gated on quarry). */
export function partnerTabsForRoles(roles: readonly string[]): PartnerTab[] {
  return TABS.filter(
    (t) => !t.requiresRole || t.requiresRole.some((r) => roles.includes(r)),
  ).map((t) => t.tab);
}

export function resolvePartnerTab(
  value: string | undefined,
  roles: readonly string[],
): PartnerTab {
  const allowed = partnerTabsForRoles(roles);
  return value && allowed.includes(value as PartnerTab) ? (value as PartnerTab) : "general";
}

interface PartnerTabsProps {
  /** Card route, e.g. `/partners/{id}`. */
  basePath: string;
  active: PartnerTab;
  roles: readonly string[];
}

/**
 * Sub-tabs for the partner card. URL-query driven (`?tab=`) to match the project's
 * DealTabs/BoardTabs/InboxTabs pattern — no client state, deep-linkable. Server Component.
 */
export function PartnerTabs({ basePath, active, roles }: PartnerTabsProps) {
  const visible = TABS.filter(
    (t) => !t.requiresRole || t.requiresRole.some((r) => roles.includes(r)),
  );

  return (
    <nav
      aria-label="Разделы контрагента"
      className="flex w-full gap-1 overflow-x-auto rounded-[var(--radius-md)] bg-surface-1 p-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:w-auto [&::-webkit-scrollbar]:hidden"
    >
      {visible.map((t) => {
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
