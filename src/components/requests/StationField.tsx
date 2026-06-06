"use client";

import { useEffect, useId, useRef, useState } from "react";
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

interface StationFieldProps {
  label: string;
  raw: string;
  road: string;
  esr: string | null;
  onChange: (patch: { raw?: string; road?: string; esr?: string | null }) => void;
}

const DEBOUNCE_MS = 400;
const MIN_CHARS = 2;
const MAX_CANDIDATES = 4;

const inputClass =
  "h-11 w-full rounded-[var(--radius-sm)] border border-border bg-surface-inset px-2.5 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] md:h-9";

// Fire-and-forget alias self-training: a confirmed candidate teaches the resolver
// that `alias` → `esrCode`. Failure is silently ignored (assistive, never blocking).
function trainAlias(alias: string, esrCode: string): void {
  void fetch("/api/stations/confirm-alias", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ alias, esrCode }),
  }).catch(() => {});
}

/** Assistive station text field: debounced resolve → auto-set ESR on exact, else
 *  show candidate chips. Never blocks typing; all resolution is best-effort. */
export function StationField({ label, raw, road, esr, onChange }: StationFieldProps) {
  const labelId = useId();
  const [exact, setExact] = useState<Candidate | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  // Suppress the next resolve when WE just set raw/road from a chip click.
  const skipResolveRef = useRef(false);

  useEffect(() => {
    const q = raw.trim();
    if (skipResolveRef.current) {
      skipResolveRef.current = false;
      return;
    }
    if (esr) return; // already confirmed; don't churn
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
        body: JSON.stringify({ q, roadHint: road.trim() || undefined }),
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
            // Auto-fill the road (short code) on confirm — operator never types it.
            // Don't clobber a road the operator already entered.
            const roadFill = cands[0].roadShort ?? cands[0].roadName ?? "";
            onChange({
              esr: cands[0].esrCode,
              ...(road.trim() ? {} : roadFill ? { road: roadFill } : {}),
            });
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
  }, [raw, road, esr, onChange]);

  function pickCandidate(c: Candidate) {
    skipResolveRef.current = true;
    setExact(c);
    setCandidates([]);
    onChange({ raw: c.name, road: c.roadShort ?? c.roadName, esr: c.esrCode });
    trainAlias(raw.trim(), c.esrCode);
  }

  function reset() {
    setExact(null);
    setCandidates([]);
    onChange({ esr: null });
  }

  return (
    <div className="flex flex-col gap-1.5 sm:col-span-2">
      <span id={labelId} className="label-caps">
        {label}
      </span>
      <input
        aria-labelledby={labelId}
        className={inputClass}
        value={raw}
        onChange={(e) => onChange({ raw: e.target.value, esr: esr ? null : esr })}
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          aria-label="Дорога"
          placeholder="дорога"
          className={inputClass}
          value={road}
          onChange={(e) => onChange({ road: e.target.value })}
        />
        <input
          aria-label="Код станции (ЕСР)"
          placeholder="код ЕСР"
          inputMode="numeric"
          className={cn(inputClass, "tabular-nums")}
          value={esr ?? ""}
          onChange={(e) => onChange({ esr: e.target.value.replace(/\D/g, "").slice(0, 6) || null })}
        />
      </div>

      {esr && exact && (
        <div className="flex items-center gap-1.5 text-2xs text-success">
          <Check className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {exact.name} · {exact.roadName} · {exact.esrCode}
          </span>
          <button
            type="button"
            onClick={reset}
            className="ml-auto inline-flex min-h-[24px] items-center gap-0.5 text-text-tertiary hover:text-danger"
          >
            <X className="size-3" aria-hidden /> сбросить
          </button>
        </div>
      )}

      {!esr && candidates.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {candidates.map((c) => (
            <button
              key={c.esrCode}
              type="button"
              onClick={() => pickCandidate(c)}
              className="inline-flex min-h-[32px] items-center rounded-pill border border-border bg-surface-3 px-2.5 py-1 text-2xs text-text-secondary hover:border-accent hover:text-text focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
            >
              {c.name} · {c.roadName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
