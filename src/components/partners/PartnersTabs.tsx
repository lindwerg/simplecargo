import Link from "next/link";
import { Briefcase, Mountain, Truck } from "lucide-react";

import type { PartnerRoleCounts } from "@/lib/partners/repository";
import { cn } from "@/lib/utils";

type FilterRole = "client" | "carrier" | "quarry";

const FILTERS: { role: FilterRole; label: string; hint: string; Icon: typeof Briefcase }[] = [
  { role: "client", label: "Клиенты", hint: "заказывают перевозку", Icon: Briefcase },
  { role: "carrier", label: "Перевозчики", hint: "дают и берут вагоны", Icon: Truck },
  { role: "quarry", label: "Карьеры", hint: "щебень и погрузка", Icon: Mountain },
];

interface PartnersTabsProps {
  /** active role tab — "client" | "carrier" | "quarry" */
  role: string;
  /** preserved search query */
  search: string;
  /** per-category totals shown on each card */
  counts: PartnerRoleCounts;
}

/** URL-state filter cards splitting the partner book into Клиенты / Перевозчики / Карьеры. */
export function PartnersTabs({ role, search, counts }: PartnersTabsProps) {
  const buildHref = (tabRole: string): string => {
    const params = new URLSearchParams();
    params.set("role", tabRole);
    if (search) params.set("search", search);
    return `/partners?${params.toString()}`;
  };

  return (
    <nav aria-label="Категория партнёров" className="partner-filters">
      {FILTERS.map(({ role: filterRole, label, hint, Icon }) => {
        const active = filterRole === role;
        return (
          <Link
            key={filterRole}
            href={buildHref(filterRole)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "partner-filter",
              `partner-filter--${filterRole}`,
              active && "partner-filter--active",
            )}
          >
            <span className="partner-filter__icon" aria-hidden>
              <Icon className="size-5" strokeWidth={2.2} />
            </span>
            <span className="partner-filter__body">
              <span className="partner-filter__label">{label}</span>
              <span className="partner-filter__hint">{hint}</span>
            </span>
            <span className="partner-filter__count tabular-nums">{counts[filterRole]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
