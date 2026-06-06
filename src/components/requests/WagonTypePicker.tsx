"use client";

import { useId, useState } from "react";

import { cn } from "@/lib/utils";
import { WAGON_TYPES, isKnownWagonType, normalizeWagonType } from "@/lib/wagons/wagon-type";

interface WagonTypePickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

const OTHER = "__other__";

const selectClass =
  "h-11 w-full rounded-[var(--radius-sm)] border border-border bg-surface-inset px-2.5 text-sm text-text focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] md:h-9";
const inputClass =
  "h-11 w-full rounded-[var(--radius-sm)] border border-border bg-surface-inset px-2.5 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] md:h-9";

/** Closed-set wagon-type chooser with an "иное" free-text escape hatch (Goal 3).
 *  A recognized code (or empty) drives the native <select>; anything else lands in
 *  the free-text field. Free input is run through normalizeWagonType so a typed
 *  synonym snaps back to its canonical code. */
export function WagonTypePicker({ value, onChange, className }: WagonTypePickerProps) {
  const labelId = useId();
  const isOther = value.trim().length > 0 && !isKnownWagonType(value.trim());
  const [freeMode, setFreeMode] = useState(isOther);

  function onSelect(next: string) {
    if (next === OTHER) {
      setFreeMode(true);
      return;
    }
    setFreeMode(false);
    onChange(next);
  }

  function onFreeBlur(raw: string) {
    const hit = normalizeWagonType(raw);
    if (hit) {
      setFreeMode(false);
      onChange(hit.code);
    }
  }

  const selectValue = freeMode || isOther ? OTHER : value;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <select
        aria-labelledby={labelId}
        aria-label="Тип вагона"
        value={selectValue}
        onChange={(e) => onSelect(e.target.value)}
        className={selectClass}
      >
        <option value="">— тип вагона —</option>
        {WAGON_TYPES.map((t) => (
          <option key={t.code} value={t.code}>
            {t.label} ({t.code})
          </option>
        ))}
        <option value={OTHER}>иное…</option>
      </select>
      {(freeMode || isOther) && (
        <input
          type="text"
          aria-label="Тип вагона (свободный ввод)"
          value={isKnownWagonType(value.trim()) ? "" : value}
          placeholder="напр. полувагон"
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onFreeBlur(e.target.value)}
          className={inputClass}
        />
      )}
    </div>
  );
}
