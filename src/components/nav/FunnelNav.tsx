"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

type Stage = "requests" | "directions" | "reports";

interface StageDef {
  key: Stage;
  href: string;
  ru: string;
  glyph: string;
  toneClass: string;
}

// The funnel IS the pipeline (DESIGN_DIRECTION §4.1). Glyph shapes echo the StatusPill family:
// ◆ won-bound requests · ● live directions · ▦ the month's report.
const STAGES: StageDef[] = [
  { key: "requests", href: "/requests", ru: "Запросы", glyph: "◆", toneClass: "text-info" },
  { key: "directions", href: "/directions", ru: "Направления", glyph: "●", toneClass: "text-success" },
  { key: "reports", href: "/reports", ru: "Отчётность", glyph: "▦", toneClass: "text-accent-text" },
];

interface FunnelNavProps {
  counts: { requests: number; directions: number; reportLabel: string };
}

function badgeFor(stage: Stage, counts: FunnelNavProps["counts"]): string {
  if (stage === "requests") return String(counts.requests);
  if (stage === "directions") return String(counts.directions);
  return counts.reportLabel;
}

export function FunnelNav({ counts }: FunnelNavProps) {
  const pathname = usePathname();
  // Self-derive the active stage from the URL (robust across client navigation);
  // /dashboard and other non-funnel routes highlight nothing.
  const activeStage = STAGES.find(
    (s) => pathname === s.href || pathname.startsWith(`${s.href}/`),
  )?.key;

  return (
    <>
      {/* ── Desktop rail (≥768): three stages joined by a thin connector ── */}
      <nav aria-label="Основная навигация" className="hidden md:block">
        <ol className="flex items-center">
          {STAGES.map((stage, i) => {
            const isActive = stage.key === activeStage;
            return (
              <li key={stage.key} className="flex items-center">
                <Link
                  href={stage.href}
                  aria-current={isActive ? "page" : undefined}
                  className="group relative flex h-12 items-center gap-2 px-1 outline-none focus-visible:[box-shadow:var(--ring-focus)]"
                >
                  <span aria-hidden className={cn("text-[0.85em] leading-none", stage.toneClass)}>
                    {stage.glyph}
                  </span>
                  <span
                    className={cn(
                      "text-sm uppercase tracking-[0.04em] transition-colors",
                      isActive
                        ? "font-[620] text-text"
                        : "font-medium text-text-secondary group-hover:text-text",
                    )}
                  >
                    {stage.ru}
                  </span>
                  <span className="num rounded-pill bg-surface-2 px-1.5 py-0.5 text-2xs text-text-tertiary">
                    {badgeFor(stage.key, counts)}
                  </span>
                  {/* amber underline animates via transform: scaleX (compositor; snaps under reduced-motion) */}
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-x-1 -bottom-px h-0.5 origin-left bg-accent transition-transform duration-[var(--duration-normal)] ease-[var(--ease-out-quad)]",
                      isActive ? "scale-x-100" : "scale-x-0",
                    )}
                  />
                </Link>
                {i < STAGES.length - 1 && (
                  <ArrowRight aria-hidden className="mx-2 size-4 shrink-0 text-text-tertiary" />
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* ── Mobile bottom bar (<768): plain tap-only, no swipe-advance (fix H4) ── */}
      <nav
        aria-label="Основная навигация"
        className="fixed inset-x-0 bottom-0 z-40 flex h-14 border-t border-border bg-surface-1 md:hidden"
      >
        {STAGES.map((stage) => {
          const isActive = stage.key === activeStage;
          return (
            <Link
              key={stage.key}
              href={stage.href}
              aria-current={isActive ? "page" : undefined}
              className="flex flex-1 flex-col items-center justify-center gap-0.5 outline-none focus-visible:[box-shadow:var(--ring-focus)]"
            >
              <span aria-hidden className={cn("text-sm leading-none", isActive ? "text-accent" : "text-text-tertiary")}>
                {stage.glyph}
              </span>
              <span
                className={cn(
                  "text-2xs uppercase tracking-[0.04em]",
                  isActive ? "font-[620] text-accent-text" : "text-text-secondary",
                )}
              >
                {stage.ru}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
