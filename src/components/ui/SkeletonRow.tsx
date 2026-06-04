import { cn } from "@/lib/utils";

interface SkeletonRowProps {
  /** Per-cell widths — number → px, string → raw CSS (e.g. "40%", "8rem"). Mirror real columns. */
  columns: Array<number | string>;
  /** Use the dense table row height. */
  dense?: boolean;
  className?: string;
}

function toWidth(w: number | string): string {
  return typeof w === "number" ? `${w}px` : w;
}

/**
 * Loading skeleton row — shimmer blocks at the EXACT column widths they stand in for, so the
 * loading state mirrors the real table (§4.10). Shimmer is translateX-only and freezes under
 * prefers-reduced-motion (globals.css). Server Component.
 */
export function SkeletonRow({ columns, dense, className }: SkeletonRowProps) {
  return (
    <div
      aria-hidden
      className={cn("flex items-center gap-4 px-4", className)}
      style={{ height: dense ? "var(--row-h-dense)" : "var(--row-h)" }}
    >
      {columns.map((w, i) => (
        <div
          key={i}
          className="skeleton-shimmer h-3.5 rounded-sm"
          style={{ width: toWidth(w) }}
        />
      ))}
    </div>
  );
}
