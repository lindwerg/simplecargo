"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { NAV_ITEMS, isActive } from "@/components/nav/nav-items";
import type { NavCounts } from "@/components/nav/SideRail";

interface BottomBarProps {
  counts: NavCounts;
}

function badgeCount(key: string, counts: NavCounts): number {
  if (key === "requests") return counts.requests;
  if (key === "directions") return counts.directions;
  return 0;
}

/**
 * Mobile floating glass bottom bar (<768). Pill-shaped, translucent + blurred, floats above
 * content with a margin and respects the iOS home-indicator safe area (PWA standalone).
 */
export function BottomBar({ counts }: BottomBarProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Основная навигация"
      className={cn(
        "fixed inset-x-3 z-40 flex items-stretch justify-around gap-1 rounded-[var(--radius-xl)] md:hidden",
        "border border-[var(--glass-border)] bg-[var(--glass-surface)] px-1.5 py-1.5 backdrop-blur-xl",
        "shadow-[var(--elev-3)] bottom-[calc(0.5rem+env(safe-area-inset-bottom))]",
      )}
    >
      {NAV_ITEMS.map(({ key, href, ru, Icon }) => {
        const active = isActive(pathname, href);
        const count = badgeCount(key, counts);
        return (
          <Link
            key={key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-lg)] py-1.5",
              "outline-none focus-visible:[box-shadow:var(--ring-focus)]",
            )}
          >
            <span
              className={cn(
                "relative grid size-8 place-items-center rounded-full transition-colors duration-[var(--duration-fast)]",
                active ? "bg-accent-quiet" : "",
              )}
            >
              <Icon
                aria-hidden
                className={cn("size-5", active ? "text-accent" : "text-text-tertiary")}
              />
              {count > 0 && (
                <span className="num absolute -right-1 -top-0.5 min-w-4 rounded-pill bg-accent px-1 text-center text-2xs font-medium leading-4 text-text-inverse">
                  {count}
                </span>
              )}
            </span>
            <span
              className={cn(
                "block w-full whitespace-nowrap text-center text-[0.5625rem] uppercase leading-none tracking-[0.01em]",
                active ? "font-[620] text-accent-text" : "text-text-tertiary",
              )}
            >
              {ru}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
