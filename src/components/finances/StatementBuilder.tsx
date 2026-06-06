"use client";

import { useState } from "react";
import { FileText, FileSpreadsheet, FileDigit } from "lucide-react";

import { Money } from "@/components/ui/Money";

interface AccountInfo {
  title: string | null;
  maskedNumber: string | null;
  balance: number | null;
}

interface StatementBuilderProps {
  account: AccountInfo | null;
}

const BLOCK = "rounded-xl bg-surface-2 p-4";
const LABEL = "block text-xs text-text-tertiary mb-1";
const INPUT =
  "w-full bg-transparent text-sm text-text outline-none placeholder:text-text-tertiary";

function daysAgoIso(days: number): string {
  const d = new Date(Date.now() + 3 * 3600_000 - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}
function todayIso(): string {
  return new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
}

/**
 * Конструктор выписки в стиле Точки: период, счёт, контрагент, тип операций и
 * выгрузка в CSV/XLSX. Файл формируется из синхронизированных операций.
 */
export function StatementBuilder({ account }: StatementBuilderProps) {
  const [from, setFrom] = useState(daysAgoIso(7));
  const [to, setTo] = useState(todayIso());
  const [direction, setDirection] = useState<"" | "in" | "out">("");
  const [q, setQ] = useState("");

  function download(format: "csv" | "xlsx") {
    const params = new URLSearchParams({ format, from, to });
    if (direction) params.set("direction", direction);
    if (q.trim()) params.set("q", q.trim());
    window.location.assign(`/api/finances/tochka/statement/export?${params.toString()}`);
  }

  return (
    <div className="space-y-3">
      <div className={BLOCK}>
        <label className={LABEL}>Выберите даты</label>
        <div className="flex items-center gap-2 text-sm text-text">
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={INPUT} />
          <span className="text-text-tertiary">—</span>
          <input type="date" value={to} min={from} max={todayIso()} onChange={(e) => setTo(e.target.value)} className={INPUT} />
        </div>
        <p className="mt-1 text-xs text-text-tertiary">По московскому времени</p>
      </div>

      {account && (
        <div className={`${BLOCK} flex items-center justify-between`}>
          <div>
            <p className="text-sm font-semibold text-text">
              <Money value={account.balance ?? 0} />
            </p>
            <p className="text-xs text-text-tertiary">
              {account.title ?? "Расчётный"}{account.maskedNumber ? ` · ${account.maskedNumber}` : ""}
            </p>
          </div>
          <span className="grid size-6 place-items-center rounded-full bg-accent text-xs text-accent-text">✓</span>
        </div>
      )}

      <div className={BLOCK}>
        <label className={LABEL} htmlFor="st-cp">Контрагент</label>
        <input
          id="st-cp"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск по ИНН и названию"
          className={INPUT}
        />
        <p className="mt-1 text-xs text-text-tertiary">Оставьте пустым для выписки по всем</p>
      </div>

      <div className={BLOCK}>
        <label className={LABEL} htmlFor="st-type">Тип операций</label>
        <select
          id="st-type"
          value={direction}
          onChange={(e) => setDirection(e.target.value as "" | "in" | "out")}
          className={`${INPUT} cursor-pointer`}
        >
          <option value="">Все типы</option>
          <option value="in">Поступления</option>
          <option value="out">Списания</option>
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => download("xlsx")}
          className="inline-flex items-center gap-1.5 rounded-pill bg-accent px-4 py-2 text-sm font-medium text-accent-text transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        >
          <FileSpreadsheet className="size-4" aria-hidden /> XLSX
        </button>
        <button
          type="button"
          onClick={() => download("csv")}
          className="inline-flex items-center gap-1.5 rounded-pill bg-surface-2 px-4 py-2 text-sm font-medium text-text transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        >
          <FileDigit className="size-4" aria-hidden /> CSV
        </button>
        <span
          title="Скоро"
          className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-pill bg-surface-2 px-4 py-2 text-sm font-medium text-text-tertiary opacity-60"
        >
          <FileText className="size-4" aria-hidden /> PDF
        </span>
      </div>
    </div>
  );
}
