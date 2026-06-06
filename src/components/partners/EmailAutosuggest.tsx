"use client";

import { useEffect, useRef, useState } from "react";

import type { EmailSuggestion } from "@/lib/contacts/suggest";
import { inputClass } from "./form-primitives";

interface EmailAutosuggestProps {
  value: string;
  onChange: (email: string) => void;
  onPick?: (suggestion: EmailSuggestion) => void;
  placeholder?: string;
}

// Email input with autosuggest from mail history (MAIL_AI_INTEGRATION §6.5).
// As the operator types, it queries /api/contacts/suggest (debounced) and offers
// addresses we've already corresponded with — "новый из переписки" badge for
// addresses not yet attached to a company.
export function EmailAutosuggest({ value, onChange, onPick, placeholder }: EmailAutosuggestProps) {
  const [items, setItems] = useState<EmailSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setItems([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      fetch(`/api/contacts/suggest?q=${encodeURIComponent(q)}&limit=8`)
        .then((r) => r.json())
        .then((j) => {
          if (!cancelled && j?.success) setItems(j.data as EmailSuggestion[]);
        })
        .catch(() => {});
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [value]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const showing = items.filter((it) => it.email.toLowerCase() !== value.trim().toLowerCase());

  return (
    <div ref={boxRef} className="relative">
      <input
        type="email"
        value={value}
        autoComplete="off"
        placeholder={placeholder ?? "info@company.ru"}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        className={inputClass}
      />
      {open && showing.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-[var(--radius-md)] border border-border bg-surface-3 py-1 shadow-[var(--elev-3)]">
          {showing.map((s) => (
            <li key={s.email}>
              <button
                type="button"
                onClick={() => {
                  onChange(s.email);
                  onPick?.(s);
                  setOpen(false);
                }}
                className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-text hover:bg-surface-2 md:min-h-0"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{s.email}</span>
                  {s.displayName && (
                    <span className="truncate text-2xs text-text-tertiary">{s.displayName}</span>
                  )}
                </span>
                <span
                  className={
                    s.isLinked
                      ? "shrink-0 rounded-pill bg-success-quiet px-2 py-0.5 text-2xs text-success"
                      : "shrink-0 rounded-pill bg-warn-quiet px-2 py-0.5 text-2xs text-warn"
                  }
                >
                  {s.isLinked ? "в базе" : "новый из переписки"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
