"use client";

import * as React from "react";
import { Check, X } from "lucide-react";

import { cn } from "@/lib/utils";

interface Candidate {
  esrCode: string;
  name: string;
  roadCode: string;
  roadName: string;
  roadShort: string | null;
  score: number;
}

// The value a StationField emits: a free-text label plus an optional resolved ESR.
export interface StationValue {
  raw: string;
  esr: string | null;
}

interface StationFieldProps {
  label: string;
  value: StationValue;
  onChange: (value: StationValue) => void;
  disabled?: boolean;
}

const DEBOUNCE_MS = 400;
const MIN_CHARS = 2;
const MAX_CANDIDATES = 4;

const inputClass =
  "h-11 w-full rounded-[var(--radius-sm)] border border-border bg-surface-inset px-2.5 text-sm text-text " +
  "placeholder:text-text-tertiary focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] md:h-9";

// Fire-and-forget alias self-training (assistive, never blocking).
function trainAlias(alias: string, esrCode: string): void {
  void fetch("/api/stations/confirm-alias", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ alias, esrCode }),
  }).catch(() => {});
}

// Assistive single-station field: debounced resolve via /api/stations/resolve → auto-set
// ESR on exact, else show candidate chips. Reusable across deal/stone forms. Never blocks
// typing; all resolution is best-effort (D15: raw text is always valid).
export function StationField({ label, value, onChange, disabled }: StationFieldProps) {
  const labelId = React.useId();
  const [exact, setExact] = React.useState<Candidate | null>(null);
  const [candidates, setCandidates] = React.useState<Candidate[]>([]);
  const skipResolveRef = React.useRef(false);

  const raw = value.raw;
  const esr = value.esr;

  React.useEffect(() => {
    const q = raw.trim();
    if (skipResolveRef.current) {
      skipResolveRef.current = false;
      return;
    }
    if (esr) return; // already confirmed
    if (q.length < MIN_CHARS) {
      setExact(null);
      setCandidates([]);
      return;
    }

    let cancelled = false;
    const handle = setTimeout(() => {
      void fetch("/api/stations/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q }),
      })
        .then((r) => r.json())
        .then((j) => {
          if (cancelled || !j?.success) return;
          const { status, candidates: cands } = j.data as {
            status: "exact" | "ambiguous" | "none";
            candidates: Candidate[];
          };
          if (status === "exact" && cands[0]) {
            setExact(cands[0]);
            setCandidates([]);
            onChange({ raw, esr: cands[0].esrCode });
          } else {
            setExact(null);
            setCandidates(cands.slice(0, MAX_CANDIDATES));
          }
        })
        .catch(() => {});
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [raw, esr, onChange]);

  function pickCandidate(c: Candidate) {
    skipResolveRef.current = true;
    setExact(c);
    setCandidates([]);
    onChange({ raw: c.name, esr: c.esrCode });
    trainAlias(raw.trim(), c.esrCode);
  }

  function reset() {
    setExact(null);
    setCandidates([]);
    onChange({ raw, esr: null });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="label-caps">
        {label}
      </span>
      <input
        aria-labelledby={labelId}
        className={inputClass}
        value={raw}
        disabled={disabled}
        onChange={(e) => onChange({ raw: e.target.value, esr: esr ? null : esr })}
        placeholder="станция погрузки"
      />

      {esr && exact && (
        <div className="flex items-center gap-1.5 text-2xs text-success">
          <Check className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {exact.name} · {exact.roadName} · {exact.esrCode}
          </span>
          <button
            type="button"
            onClick={reset}
            disabled={disabled}
            className="ml-auto inline-flex min-h-[24px] items-center gap-0.5 text-text-tertiary hover:text-danger"
          >
            <X className="size-3" aria-hidden /> сбросить
          </button>
        </div>
      )}

      {esr && !exact && (
        <span className="text-2xs text-text-tertiary tabular-nums">ЕСР {esr}</span>
      )}

      {!esr && candidates.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {candidates.map((c) => (
            <button
              key={c.esrCode}
              type="button"
              disabled={disabled}
              onClick={() => pickCandidate(c)}
              className={cn(
                "inline-flex min-h-[32px] items-center rounded-pill border border-border bg-surface-3 px-2.5 py-1 text-2xs text-text-secondary",
                "hover:border-accent hover:text-text focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]",
              )}
            >
              {c.name} · {c.roadName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
