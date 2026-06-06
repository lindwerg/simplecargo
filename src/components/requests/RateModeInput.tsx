"use client";

import { Minus, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { type RateKind, formatRateExpression } from "@/lib/pricing/rate-expression";

interface RateModeInputProps {
  kind: string;
  flatRaw: string;
  markupPct: string;
  tariffClass: string;
  onChange: (
    patch: Partial<{ kind: string; flatRaw: string; markupPct: string; tariffClass: string }>,
  ) => void;
}

const FLAT: RateKind = "flat_rub";
const INDICATIVE: RateKind = "tariff_indicative";
const MARKUP_STEP = 1;

const fieldClass =
  "h-11 w-full rounded-[var(--radius-sm)] border border-border bg-surface-inset px-2.5 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] md:h-9";

function segClass(active: boolean): string {
  return cn(
    "inline-flex h-11 flex-1 items-center justify-center rounded-[var(--radius-sm)] px-3 text-sm transition-colors focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] md:h-9",
    active ? "bg-accent font-semibold text-text-inverse" : "text-text-secondary hover:text-text",
  );
}

// Live preview string from the current draft values.
function preview(kind: string, flatRaw: string, markupPct: string): string {
  if (kind === FLAT) {
    const amount = Number(flatRaw.replace(/[^\d.,]/g, "").replace(",", "."));
    return formatRateExpression({
      kind: FLAT,
      flatAmount: Number.isFinite(amount) && amount > 0 ? amount : null,
    });
  }
  const pct = Number(String(markupPct).replace(",", "."));
  return formatRateExpression({
    kind: INDICATIVE,
    markupPct: Number.isFinite(pct) ? pct : 0,
  });
}

/** Two-mode rate entry (Goal 4): fixed ₽/wagon vs. indicative %-to-10-01, with a
 *  live formatted preview. Mobile-first; segmented toggle stacks comfortably. */
export function RateModeInput({ kind, flatRaw, markupPct, tariffClass, onChange }: RateModeInputProps) {
  const isFlat = kind === FLAT;

  function bumpMarkup(delta: number) {
    const current = Number(String(markupPct).replace(",", ".")) || 0;
    onChange({ markupPct: String(current + delta) });
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        role="tablist"
        aria-label="Тип ставки"
        className="flex gap-1 rounded-[var(--radius-md)] border border-border bg-surface-inset p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={isFlat}
          onClick={() => onChange({ kind: FLAT })}
          className={segClass(isFlat)}
        >
          Фикс. ₽/ваг
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!isFlat}
          onClick={() => onChange({ kind: INDICATIVE })}
          className={segClass(!isFlat)}
        >
          Индикатив к 10-01
        </button>
      </div>

      {isFlat ? (
        <input
          aria-label="Ставка, ₽/вагон"
          inputMode="numeric"
          className={fieldClass}
          value={flatRaw}
          placeholder="30000"
          onChange={(e) => onChange({ flatRaw: e.target.value })}
        />
      ) : (
        <div className="flex gap-2">
          <div className="flex flex-1 items-stretch gap-1">
            <button
              type="button"
              aria-label="Уменьшить наценку"
              onClick={() => bumpMarkup(-MARKUP_STEP)}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-border bg-surface-3 text-text-secondary hover:text-text focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] md:h-9 md:w-9"
            >
              <Minus className="size-4" aria-hidden />
            </button>
            <input
              aria-label="Наценка к тарифу, %"
              inputMode="numeric"
              className={fieldClass}
              value={markupPct}
              placeholder="%"
              onChange={(e) => onChange({ markupPct: e.target.value })}
            />
            <button
              type="button"
              aria-label="Увеличить наценку"
              onClick={() => bumpMarkup(MARKUP_STEP)}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-border bg-surface-3 text-text-secondary hover:text-text focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] md:h-9 md:w-9"
            >
              <Plus className="size-4" aria-hidden />
            </button>
          </div>
          <select
            aria-label="Тарифный класс"
            className="h-11 w-20 shrink-0 rounded-[var(--radius-sm)] border border-border bg-surface-inset px-2 text-sm text-text focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] md:h-9"
            value={tariffClass || "1"}
            onChange={(e) => onChange({ tariffClass: e.target.value })}
          >
            <option value="1">1 кл</option>
            <option value="2">2 кл</option>
            <option value="3">3 кл</option>
          </select>
        </div>
      )}

      <span className="font-mono text-2xs tabular-nums text-text-tertiary">
        {preview(kind, flatRaw, markupPct)}
      </span>
    </div>
  );
}
