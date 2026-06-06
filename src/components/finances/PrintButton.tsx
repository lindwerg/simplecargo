"use client";

import { Printer } from "lucide-react";

/** Print / Save-as-PDF trigger for the statement print view. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-accent-text hover:opacity-90 focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
    >
      <Printer className="size-4" aria-hidden /> Печать / Сохранить PDF
    </button>
  );
}
