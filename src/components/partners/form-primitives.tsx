import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// Shared form look for the Партнёры surface — same tokens as the RFQ intake form
// (IntakeStudio) so the two surfaces feel like one product.
export const inputClass =
  "h-11 w-full min-w-0 rounded-[var(--radius-sm)] border border-border bg-surface-inset px-2.5 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] md:h-9";

export const textareaClass =
  "w-full resize-y rounded-[var(--radius-sm)] border border-border bg-surface-inset p-2.5 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]";

export function Field({
  label,
  span2,
  children,
}: {
  label: string;
  span2?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1", span2 && "sm:col-span-2")}>
      <span className="label-caps">{label}</span>
      {children}
    </label>
  );
}

export function Banner({ tone, children }: { tone: "danger" | "warn"; children: ReactNode }) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "rounded-[var(--radius-md)] border px-4 py-3 text-sm",
        tone === "danger"
          ? "border-danger bg-danger-quiet text-danger"
          : "border-warn bg-warn-quiet text-warn",
      )}
    >
      {children}
    </div>
  );
}
