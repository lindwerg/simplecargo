"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/nav/BrandMark";
import { SignOutButton } from "@/components/nav/SignOutButton";
import { NAV_ITEMS, isActive } from "@/components/nav/nav-items";

export interface NavCounts {
  requests: number;
  directions: number;
  inbox: number;
}

interface SideRailProps {
  counts: NavCounts;
}

function badgeCount(key: string, counts: NavCounts): number {
  if (key === "requests") return counts.requests;
  if (key === "directions") return counts.directions;
  if (key === "inbox") return counts.inbox;
  return 0;
}

/**
 * Desktop floating glass rail (≥768). Brand at top, nav items (icon over label) in the
 * middle, theme toggle + sign-out at the bottom. Glassmorphism via translucent surface +
 * backdrop blur; floats with a margin from the viewport edges.
 */
export function SideRail({ counts }: SideRailProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Основная навигация"
      className={cn(
        "fixed inset-y-3 left-3 z-40 hidden w-[6.5rem] flex-col items-center gap-1 rounded-[var(--radius-xl)]",
        "border border-[var(--glass-border)] bg-[var(--glass-surface)] px-1.5 py-3 backdrop-blur-xl",
        "shadow-[var(--elev-3)] md:flex",
      )}
    >
      <Link
        href="/dashboard"
        aria-label="SimpleCargo — на главную"
        className="mb-2 grid size-9 place-items-center rounded-[var(--radius-md)] outline-none focus-visible:[box-shadow:var(--ring-focus)]"
      >
        <BrandMark />
      </Link>

      <ul className="flex w-full flex-1 flex-col items-center justify-center gap-1.5">
        {NAV_ITEMS.map(({ key, href, ru, Icon }) => {
          const active = isActive(pathname, href);
          const count = badgeCount(key, counts);
          return (
            <li key={key} className="w-full">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex flex-col items-center gap-1 rounded-[var(--radius-lg)] px-1 py-2",
                  "outline-none transition-colors duration-[var(--duration-fast)] focus-visible:[box-shadow:var(--ring-focus)]",
                  active ? "bg-accent-quiet" : "hover:bg-surface-2",
                )}
              >
                <span className="relative">
                  <Icon
                    aria-hidden
                    className={cn(
                      "size-5 transition-colors duration-[var(--duration-fast)]",
                      active
                        ? "text-accent"
                        : "text-text-tertiary group-hover:text-text",
                    )}
                  />
                  {count > 0 && (
                    <span className="num absolute -right-2 -top-1.5 min-w-4 rounded-pill bg-accent px-1 text-center text-2xs font-medium leading-4 text-text-inverse">
                      {count}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "block w-full whitespace-nowrap text-center text-[0.625rem] uppercase leading-none tracking-[0.01em] transition-colors duration-[var(--duration-fast)]",
                    active
                      ? "font-[620] text-accent-text"
                      : "text-text-tertiary group-hover:text-text",
                  )}
                >
                  {ru}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col items-center gap-1 pt-2">
        <SignOutButton />
      </div>
    </nav>
  );
}
