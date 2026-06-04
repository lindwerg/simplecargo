import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  /** Contextual icon (e.g. Inbox for empty Запросы) — not a generic placeholder. */
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Caller-supplied action (Button / link). */
  action?: ReactNode;
  className?: string;
}

/**
 * Empty state — contextual icon at a 40% accent tint, a title, optional description, and an
 * optional action. Server Component.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        className,
      )}
    >
      <Icon className="size-10 text-accent opacity-40" aria-hidden strokeWidth={1.5} />
      <div className="space-y-1">
        <p className="text-md font-semibold text-text">{title}</p>
        {description && (
          <p className="mx-auto max-w-xs text-sm text-text-secondary">{description}</p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
