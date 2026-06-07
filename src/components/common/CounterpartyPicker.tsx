"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

// The value a CounterpartyPicker emits — mirrors counterpartyInputSchema and
// resolveCounterpartyId's CounterpartyInput. `undefined` = nothing chosen.
export type CounterpartyValue =
  | { id: string; name: string }
  | { name: string; inn?: string | undefined }
  | undefined;

interface CounterpartyMatch {
  id: string;
  nameCanonical: string;
}

interface CounterpartyPickerProps {
  label: string;
  /** Implied commercial role — passed through to find-or-create on the server. */
  role: "client" | "owner" | "quarry";
  value: CounterpartyValue;
  onChange: (value: CounterpartyValue) => void;
  disabled?: boolean;
  /** Optional caption under the label (e.g. D16 advisory note). */
  hint?: string;
}

const fieldClass =
  "h-11 w-full rounded-[var(--radius-sm)] border border-border bg-surface-inset px-2.5 text-sm text-text " +
  "placeholder:text-text-tertiary outline-none transition-[border-color,box-shadow] " +
  "focus-visible:border-accent focus-visible:[box-shadow:var(--ring-focus)] md:h-9";

const DEBOUNCE_MS = 300;
const MIN_CHARS = 2;

const ROLE_PLACEHOLDER: Record<CounterpartyPickerProps["role"], string> = {
  client: "ООО «Ромашка»",
  owner: "Собственник вагонов",
  quarry: "Карьер «Асбест»",
};

// Find-or-create counterparty picker: type a name → fuzzy-match existing companies
// (chips) or keep the typed name as a NEW company (+ optional ИНН). Used for
// client/owner/quarry. Resolution is server-side (resolveCounterpartyId).
export function CounterpartyPicker({
  label,
  role,
  value,
  onChange,
  disabled,
  hint,
}: CounterpartyPickerProps) {
  const [query, setQuery] = React.useState(() =>
    value && "name" in value ? value.name : "",
  );
  const [inn, setInn] = React.useState(() => (value && "inn" in value && value.inn) || "");
  const [matches, setMatches] = React.useState<CounterpartyMatch[]>([]);
  const skipSearchRef = React.useRef(false);

  const chosenId = value && "id" in value ? value.id : null;

  React.useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }
    if (chosenId) return; // already confirmed an existing one
    const q = query.trim();
    if (q.length < MIN_CHARS) {
      setMatches([]);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      void fetch(`/api/counterparties/search?q=${encodeURIComponent(q)}&limit=5`)
        .then((r) => r.json())
        .then((j) => {
          if (cancelled || !j?.success) return;
          setMatches((j.data?.matches as CounterpartyMatch[]) ?? []);
        })
        .catch(() => {});
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, chosenId]);

  function handleType(next: string) {
    setQuery(next);
    // Typing after a confirmed pick reverts to a NEW-name candidate.
    const trimmed = next.trim();
    onChange(trimmed ? { name: trimmed, inn: inn.trim() || undefined } : undefined);
  }

  function pickExisting(m: CounterpartyMatch) {
    skipSearchRef.current = true;
    setQuery(m.nameCanonical);
    setMatches([]);
    onChange({ id: m.id, name: m.nameCanonical });
  }

  function reset() {
    setQuery("");
    setInn("");
    setMatches([]);
    onChange(undefined);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="label-caps">{label}</span>
      {hint && <span className="text-2xs text-text-tertiary">{hint}</span>}
      <input
        aria-label={label}
        className={fieldClass}
        value={query}
        disabled={disabled}
        onChange={(e) => handleType(e.target.value)}
        placeholder={ROLE_PLACEHOLDER[role]}
      />

      {chosenId && (
        <div className="flex items-center gap-1.5 text-2xs text-success">
          <span>✓ выбран существующий контрагент</span>
          <button
            type="button"
            onClick={reset}
            disabled={disabled}
            className="ml-auto text-text-tertiary hover:text-danger"
          >
            сбросить
          </button>
        </div>
      )}

      {!chosenId && matches.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {matches.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={disabled}
              onClick={() => pickExisting(m)}
              className="inline-flex min-h-[32px] items-center rounded-pill border border-border bg-surface-3 px-2.5 py-1 text-2xs text-text-secondary hover:border-accent hover:text-text focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
            >
              {m.nameCanonical}
            </button>
          ))}
        </div>
      )}

      {!chosenId && query.trim().length >= MIN_CHARS && (
        <input
          aria-label={`ИНН — ${label}`}
          className={cn(fieldClass, "tabular-nums")}
          value={inn}
          disabled={disabled}
          inputMode="numeric"
          placeholder="ИНН (для нового контрагента, необязательно)"
          onChange={(e) => {
            const next = e.target.value.replace(/\D/g, "").slice(0, 12);
            setInn(next);
            const trimmed = query.trim();
            if (trimmed) onChange({ name: trimmed, inn: next || undefined });
          }}
        />
      )}
    </div>
  );
}
