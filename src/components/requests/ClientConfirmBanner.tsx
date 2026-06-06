"use client";

import { useEffect, useState } from "react";

interface Match {
  id: string;
  name: string;
  roles?: string[];
  score?: number;
}

interface ClientConfirmBannerProps {
  guess: string;
  onConfirm: (match: { id: string; name: string }) => void;
  onReject: () => void;
}

/** D16: AI client guess confirmation. Never auto-confirms — the operator must
 *  click [Да] explicitly. On mount, looks up the guess; if a top match exists,
 *  asks «это они?»; otherwise notes the client will be created as new. */
export function ClientConfirmBanner({ guess, onConfirm, onReject }: ClientConfirmBannerProps) {
  const [top, setTop] = useState<Match | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/counterparties/search?q=${encodeURIComponent(guess)}&limit=3`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const matches = (j?.success ? j.data.matches : []) as Match[];
        setTop(matches[0] ?? null);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [guess]);

  if (!loaded) return null;

  if (!top) {
    return (
      <div
        role="status"
        className="rounded-[var(--radius-md)] border border-border bg-surface-inset px-4 py-2.5 text-sm text-text-secondary"
      >
        Клиента «{guess}» нет в базе — будет создан как новый.
      </div>
    );
  }

  return (
    <div
      role="status"
      className="flex flex-col gap-2.5 rounded-[var(--radius-md)] border border-info bg-info-quiet px-4 py-3 text-sm text-text sm:flex-row sm:items-center sm:justify-between"
    >
      <p>
        ИИ распознал клиента «{guess}». Это <span className="font-semibold">{top.name}</span>?
      </p>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => onConfirm({ id: top.id, name: top.name })}
          className="inline-flex h-9 min-h-[44px] items-center rounded-[var(--radius-md)] bg-accent px-3.5 text-sm font-semibold text-text-inverse hover:bg-accent-hover focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] sm:min-h-0"
        >
          Да, это они
        </button>
        <button
          type="button"
          onClick={onReject}
          className="inline-flex h-9 min-h-[44px] items-center rounded-[var(--radius-md)] border border-border bg-surface-2 px-3.5 text-sm text-text hover:bg-surface-3 focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] sm:min-h-0"
        >
          Нет
        </button>
      </div>
    </div>
  );
}
