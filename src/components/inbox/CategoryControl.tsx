"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { KIND_CHIP } from "@/components/inbox/inbox-tabs";

// Порядок типов в выпадашке (ключи = classifier kinds, переиспользуем как ручной ярлык).
const ORDER = [
  "client_rfq",
  "carrier_quote",
  "invoice",
  "dislocation",
  "gu12",
  "document",
  "claim",
  "other",
] as const;

interface CategoryControlProps {
  emailId: string;
  current: string | null;
  /** compact — для строки списка (узкий select без подписи) */
  compact?: boolean;
}

/** Ручной ярлык типа письма: менеджер сам относит письмо к типу. Меняет kind. */
export function CategoryControl({ emailId, current, compact = false }: CategoryControlProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function change(value: string) {
    setBusy(true);
    try {
      await fetch(`/api/inbox/${emailId}/category`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: value === "" ? null : value }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const select = (
    <select
      value={current ?? ""}
      disabled={busy}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => change(e.target.value)}
      className={`rounded-[var(--radius-sm)] border border-border bg-surface-1 text-text outline-none focus-visible:[box-shadow:var(--ring-focus)] disabled:opacity-50 ${
        compact ? "px-1.5 py-0.5 text-2xs" : "px-3 py-2 text-sm"
      }`}
      aria-label="Тип письма"
    >
      <option value="">Без типа</option>
      {ORDER.map((k) => (
        <option key={k} value={k}>
          {KIND_CHIP[k]?.label ?? k}
        </option>
      ))}
    </select>
  );

  if (compact) return select;

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-text-secondary">Отнести к типу:</span>
      {select}
    </div>
  );
}
