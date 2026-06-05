import { cn } from "@/lib/utils";

interface BrandMarkProps {
  /** Show the "SimpleCargo" wordmark next to the glyph (off in the narrow rail). */
  withWordmark?: boolean;
  className?: string;
}

/** The SimpleCargo brand lockup: amber square + optional wordmark. */
export function BrandMark({ withWordmark = false, className }: BrandMarkProps) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span aria-hidden className="size-5 shrink-0 rounded-sm bg-accent" />
      {withWordmark && (
        <span className="text-sm font-semibold tracking-tight text-text">SimpleCargo</span>
      )}
      <span className="sr-only">SimpleCargo</span>
    </span>
  );
}
