"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { formatRub } from "@/lib/format";

interface RateInputProps {
  label: string;
  /** The operator-confirmed value (controlled). Empty string = not set. */
  value: string;
  onChange: (value: string) => void;
  /**
   * An advisory suggested value (from an LLM / desired rate). Shown as a hint with an
   * "applied" action — NEVER auto-written into `value` (D16/H1).
   */
  suggested?: number | null;
  /** Подпись подсказки, напр. "клиент просил". По умолчанию — "предложено". */
  suggestedLabel?: string;
  disabled?: boolean;
  placeholder?: string;
  /** Unit caption, e.g. "₽ / т" or "₽ / ваг". */
  unit?: string;
}

const inputClass =
  "h-11 w-full rounded-[var(--radius-sm)] border border-border bg-surface-inset px-2.5 text-sm text-text tabular-nums " +
  "placeholder:text-text-tertiary outline-none transition-[border-color,box-shadow] " +
  "focus-visible:border-accent focus-visible:[box-shadow:var(--ring-focus)] md:h-9";

// A money/rate input that keeps the operator-confirmed value separate from any suggested
// (LLM/desired) value. The suggestion is surfaced as an applyable hint, never written
// automatically — confirmed money is always operator-entered (D16/H1).
export function RateInput({
  label,
  value,
  onChange,
  suggested,
  suggestedLabel = "предложено",
  disabled,
  placeholder,
  unit,
}: RateInputProps) {
  const hasSuggestion = suggested !== null && suggested !== undefined && Number.isFinite(suggested);
  const applied = hasSuggestion && Number(value) === suggested;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="label-caps">
        {label}
        {unit && <span className="ml-1 lowercase text-text-tertiary">· {unit}</span>}
      </span>
      <input
        aria-label={label}
        className={inputClass}
        value={value}
        disabled={disabled}
        inputMode="decimal"
        placeholder={placeholder ?? "0"}
        onChange={(e) => {
          // Allow digits, one separator, optional minus is disallowed (rates ≥ 0).
          const next = e.target.value.replace(/[^\d.,]/g, "").replace(",", ".");
          onChange(next);
        }}
      />
      {hasSuggestion && !applied && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(String(suggested))}
          className={cn(
            "inline-flex w-fit items-center gap-1 text-2xs text-text-tertiary",
            "hover:text-accent focus:outline-none",
          )}
        >
          {suggestedLabel}: <span className="tabular-nums text-text-secondary">{formatRub(suggested!)}</span>
          <span className="text-accent">— применить</span>
        </button>
      )}
      {applied && (
        <span className="text-2xs text-text-tertiary">подтверждено по предложению</span>
      )}
    </div>
  );
}
