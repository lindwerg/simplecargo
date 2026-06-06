"use client";

import Link from "next/link";
import { Printer, ArrowLeft } from "lucide-react";

interface Props {
  id?: string;
  backHref?: string;
  backLabel?: string;
}

export function KpPrintBar({ id, backHref, backLabel }: Props) {
  const href = backHref ?? (id ? `/requests/${id}` : "/requests");
  const label = backLabel ?? "Назад к запросу";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] bg-accent px-4 text-sm font-semibold text-text-inverse hover:bg-accent-hover focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
      >
        <Printer className="size-4" aria-hidden /> Печать / Сохранить PDF
      </button>
      <Link
        href={href}
        className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface-2 px-4 text-sm text-text hover:bg-surface-3"
      >
        <ArrowLeft className="size-4" aria-hidden /> {label}
      </Link>
    </div>
  );
}
