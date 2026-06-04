"use client";

import { RotateCw, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

interface ErrorStateProps {
  /**
   * A user-facing message ONLY — never pass a raw Error or stack trace (§4.10). Callers map
   * thrown errors to friendly copy before handing it here.
   */
  message: string;
  /** `inline` → a single full-width table row · `page` → a centered card. */
  variant?: "inline" | "page";
  onRetry?: () => void;
  className?: string;
}

const RETRY_LABEL = "Повторить";

/**
 * Error state — never swallows errors silently, never leaks a stack. Client Component (it owns
 * the optional retry handler).
 */
export function ErrorState({
  message,
  variant = "inline",
  onRetry,
  className,
}: ErrorStateProps) {
  if (variant === "page") {
    return (
      <div
        role="alert"
        className={cn(
          "mx-auto flex max-w-md flex-col items-center gap-3 rounded-lg border border-border border-l-[3px] border-l-danger bg-surface-1 px-6 py-10 text-center",
          className,
        )}
      >
        <TriangleAlert className="size-8 text-danger" aria-hidden strokeWidth={1.5} />
        <p className="text-sm text-text-secondary">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-accent-text transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
          >
            <RotateCw className="size-3.5" aria-hidden />
            {RETRY_LABEL}
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={cn(
        "flex w-full items-center gap-2.5 border-b border-border-subtle px-4 py-3 text-sm",
        className,
      )}
      style={{ minHeight: "var(--row-h)" }}
    >
      <TriangleAlert className="size-4 shrink-0 text-danger" aria-hidden />
      <span className="text-text-secondary">{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="ml-auto inline-flex items-center gap-1.5 text-accent-text transition-colors hover:underline focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        >
          <RotateCw className="size-3.5" aria-hidden />
          {RETRY_LABEL}
        </button>
      )}
    </div>
  );
}
