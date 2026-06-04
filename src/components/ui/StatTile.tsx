import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type StatVariant = "default" | "accent" | "positive" | "negative";
type StatSize = "xl" | "display";

interface StatTileProps {
  /** ALL-CAPS micro label. */
  label: string;
  /** The hero number — usually a <Money> or a mono string. */
  value: ReactNode;
  variant?: StatVariant;
  size?: StatSize;
  /** When set the tile becomes an interactive link with compositor hover physics. */
  href?: string;
  /** Optional secondary caption under the value. */
  hint?: string;
  className?: string;
}

// 3px left rail by variant (DESIGN_DIRECTION §4.3). Color-only via tokens.
const RAIL: Record<StatVariant, string> = {
  default: "border-l-border-strong",
  accent: "border-l-accent",
  positive: "border-l-money-pos",
  negative: "border-l-money-neg",
};

/**
 * KPI / Stat tile — a content-driven block, not a uniform card. The value is the largest
 * object; the label is a quiet caps micro-label. Interactive only when `href` is given, and
 * then it lifts on hover via transform/opacity only (compositor-safe). Server Component.
 */
export function StatTile({
  label,
  value,
  variant = "default",
  size = "xl",
  href,
  hint,
  className,
}: StatTileProps) {
  const valueSize = size === "display" ? "text-display" : "text-xl";

  const body = (
    <>
      <p className="label-caps">{label}</p>
      <p
        className={cn(
          "mt-1 font-bold leading-tight text-money tabular-nums",
          valueSize,
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-text-tertiary">{hint}</p>}
    </>
  );

  const shell = cn(
    "block border-l-[3px] bg-surface-1 px-4 py-3",
    RAIL[variant],
    className,
  );

  if (href) {
    return (
      <a
        href={href}
        className={cn(
          shell,
          "transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out-quad)]",
          "hover:-translate-y-[2px] active:translate-y-0 active:opacity-90",
          "focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]",
        )}
      >
        {body}
      </a>
    );
  }

  return <div className={shell}>{body}</div>;
}
