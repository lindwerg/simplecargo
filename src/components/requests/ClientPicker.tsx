"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type ClientValue =
  | { kind: "existing"; id: string; name: string }
  | { kind: "temp"; name: string }
  | null;

interface Option {
  id: string;
  name: string;
}

interface ClientPickerProps {
  value: ClientValue;
  onChange: (value: ClientValue) => void;
}

/** Combobox: search an existing counterparty OR use a free-text TEMP client (D16).
 *  Existing → clientSuggestedId; temp → clientRaw label, linked to a counterparty later. */
export function ClientPicker({ value, onChange }: ClientPickerProps) {
  const [query, setQuery] = useState(value?.name ?? "");
  const [options, setOptions] = useState<Option[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/counterparties")
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j?.success) setOptions(j.data as Option[]);
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

  const q = query.trim().toLowerCase();
  const matches = q.length > 0 ? options.filter((o) => o.name.toLowerCase().includes(q)).slice(0, 8) : [];
  const isTemp = value?.kind === "temp";

  return (
    <div ref={boxRef} className="relative">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={query}
          placeholder="Клиент — найдите в базе или введите временное имя"
          aria-label="Клиент"
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            setOpen(true);
            onChange(v.trim().length > 0 ? { kind: "temp", name: v.trim() } : null);
          }}
          className="h-10 w-full rounded-[var(--radius-md)] border border-border bg-surface-inset px-3 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        />
        {value?.kind === "existing" && (
          <span className="shrink-0 rounded-pill bg-success-quiet px-2 py-0.5 text-2xs font-medium text-success">
            из базы
          </span>
        )}
        {isTemp && (
          <span className="shrink-0 rounded-pill bg-warn-quiet px-2 py-0.5 text-2xs font-medium text-warn">
            временный
          </span>
        )}
      </div>

      {open && (matches.length > 0 || (isTemp && query.trim().length > 0)) && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface-3 py-1 shadow-[var(--elev-3)]">
          {matches.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => {
                  setQuery(o.name);
                  onChange({ kind: "existing", id: o.id, name: o.name });
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between px-3 py-2 text-left text-sm text-text hover:bg-surface-2",
                )}
              >
                <span className="truncate">{o.name}</span>
                <span className="ml-2 shrink-0 text-2xs text-text-tertiary">из базы</span>
              </button>
            </li>
          ))}
          {query.trim().length > 0 && (
            <li>
              <button
                type="button"
                onClick={() => {
                  onChange({ kind: "temp", name: query.trim() });
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface-2"
              >
                Использовать как временного клиента: <span className="text-text">«{query.trim()}»</span>
              </button>
            </li>
          )}
        </ul>
      )}
      <p className="mt-1 text-2xs text-text-tertiary">
        Нет договора? Оставьте временное имя — привяжете контрагента позже.
      </p>
    </div>
  );
}
