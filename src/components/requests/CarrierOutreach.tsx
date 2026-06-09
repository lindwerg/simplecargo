"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Mail, X } from "lucide-react";

import { cn } from "@/lib/utils";

interface CarrierOption {
  id: string;
  name: string;
  roles: string[];
}

export interface OutreachLine {
  id: string;
  label: string; // "Качканар → Дёма (10 ваг)"
}

interface CarrierOutreachProps {
  requestId: string;
  lines: OutreachLine[];
}

interface Selected {
  id: string;
  name: string;
}

interface SentResult {
  sent: { carrierName: string; email: string }[];
  skipped: { reason: string }[];
  quotesCreated: number;
  quotesUpdated: number; // повторный RFQ обновил существующие опросы (без дублей)
}

/** "Опрос перевозчиков" — pick carriers (role=carrier) + lines, send RFQ by e-mail. */
export function CarrierOutreach({ requestId, lines }: CarrierOutreachProps) {
  const [options, setOptions] = useState<CarrierOption[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Selected[]>([]);
  const [lineIds, setLineIds] = useState<string[]>(lines.map((l) => l.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SentResult | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/counterparties")
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j?.success) setOptions(j.data as CarrierOption[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const carriers = useMemo(() => options.filter((o) => o.roles.includes("carrier")), [options]);
  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      (q.length > 0 ? carriers.filter((o) => o.name.toLowerCase().includes(q)) : carriers)
        .filter((o) => !selected.some((s) => s.id === o.id))
        .slice(0, 8),
    [carriers, q, selected],
  );

  function add(o: CarrierOption) {
    setSelected((prev) => [...prev, { id: o.id, name: o.name }]);
    setQuery("");
    setOpen(false);
  }
  function remove(id: string) {
    setSelected((prev) => prev.filter((s) => s.id !== id));
  }
  function toggleLine(id: string) {
    setLineIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function send() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/requests/${requestId}/outreach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carrierIds: selected.map((s) => s.id), lineIds }),
      });
      const j = await res.json();
      if (!j?.success) {
        setError(j?.error ?? "Не удалось отправить");
        return;
      }
      setResult(j.data as SentResult);
      setSelected([]);
    } catch {
      setError("Сбой сети при отправке");
    } finally {
      setBusy(false);
    }
  }

  const canSend = selected.length > 0 && lineIds.length > 0 && !busy;

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface-2 p-5">
      <div className="flex items-center gap-2">
        <Mail className="size-4 text-accent" aria-hidden />
        <h2 className="label-caps">Опрос перевозчиков</h2>
      </div>

      {/* selected chips */}
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {selected.map((s) => (
            <li
              key={s.id}
              className="inline-flex items-center gap-1 rounded-pill bg-accent-quiet px-2.5 py-1 text-xs text-accent"
            >
              {s.name}
              <button type="button" onClick={() => remove(s.id)} aria-label={`Убрать ${s.name}`}>
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* carrier search */}
      <div ref={boxRef} className="relative">
        <input
          type="text"
          value={query}
          placeholder="Добавить перевозчика (роль «перевозчик»)"
          aria-label="Перевозчик"
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          className="h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-inset px-3 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] md:h-9"
        />
        {open && matches.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface-3 py-1 shadow-[var(--elev-3)]">
            {matches.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => add(o)}
                  className={cn(
                    "flex min-h-11 w-full items-center px-3 py-2 text-left text-sm text-text hover:bg-surface-2 md:min-h-0",
                  )}
                >
                  <span className="truncate">{o.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {carriers.length === 0 && (
          <p className="mt-1 text-2xs text-text-tertiary">
            Нет контрагентов с ролью «перевозчик» — заведите их во вкладке «Партнёры».
          </p>
        )}
      </div>

      {/* line selection */}
      {lines.length > 1 && (
        <div className="flex flex-col gap-1">
          <span className="text-2xs text-text-tertiary">Направления в запросе:</span>
          <ul className="flex flex-col gap-1">
            {lines.map((l) => (
              <li key={l.id}>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={lineIds.includes(l.id)}
                    onChange={() => toggleLine(l.id)}
                  />
                  {l.label}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={send}
        disabled={!canSend}
        className="inline-flex h-11 items-center justify-center gap-2 self-start rounded-[var(--radius-md)] bg-accent px-4 text-sm font-semibold text-text-inverse hover:bg-accent-hover disabled:opacity-50 md:h-9"
      >
        <Mail className="size-4" aria-hidden />
        {busy ? "Отправка…" : `Отправить RFQ (${selected.length})`}
      </button>

      {error && (
        <p className="rounded-[var(--radius-md)] bg-danger-quiet px-3 py-2 text-sm text-danger">{error}</p>
      )}
      {result && (
        <div className="rounded-[var(--radius-md)] bg-success-quiet px-3 py-2 text-sm text-success">
          Отправлено: {result.sent.length} ({result.quotesCreated} опросов записано
          {result.quotesUpdated > 0 ? `, ${result.quotesUpdated} обновлено` : ""}).
          {result.skipped.length > 0 && (
            <ul className="mt-1 text-warn">
              {result.skipped.map((s, i) => (
                <li key={i}>— {s.reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
