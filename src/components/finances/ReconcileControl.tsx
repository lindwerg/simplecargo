"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Link2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Match {
  id: string;
  name: string;
}

interface ReconcileControlProps {
  transactionId: string;
  linked: boolean;
  matchedName: string | null;
  counterpartyInn: string | null;
}

/** Manual reconcile: search a counterparty and attach the operation to it. */
export function ReconcileControl({
  transactionId,
  linked,
  matchedName,
  counterpartyInn,
}: ReconcileControlProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Match[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(q: string) {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    try {
      const res = await fetch(`/api/counterparties/search?q=${encodeURIComponent(q)}&limit=8`);
      const json: { success: boolean; data?: { matches: Match[] } } = await res.json();
      setResults(json.data?.matches ?? []);
    } catch {
      setResults([]);
    }
  }

  async function attach(counterpartyId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/finances/tochka/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId, counterpartyId }),
      });
      const json: { success: boolean; error?: string } = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Ошибка");
      setOpen(false);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Не удалось разнести");
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/finances/tochka/reconcile?transactionId=${transactionId}`, {
        method: "DELETE",
      });
      const json: { success: boolean; error?: string } = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Ошибка");
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Не удалось снять разнос");
    } finally {
      setBusy(false);
    }
  }

  if (linked && !open) {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm text-text">
          <Check className="size-4 text-success" aria-hidden />
          {matchedName ?? "Разнесено"}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={unlink} disabled={busy}>
          <X aria-hidden /> Снять
        </Button>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="space-y-1">
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Link2 aria-hidden /> Разнести на контрагента
        </Button>
        {counterpartyInn && (
          <p className="text-xs text-text-tertiary">ИНН из выписки: {counterpartyInn}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        type="text"
        autoFocus
        value={query}
        onChange={(e) => search(e.target.value)}
        placeholder="Поиск по названию или ИНН"
        className="w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-text outline-none focus-visible:[box-shadow:var(--ring-focus)]"
      />
      {results.length > 0 && (
        <ul className="max-h-56 divide-y divide-border-subtle overflow-auto rounded-md border border-border">
          {results.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => attach(m.id)}
                className={cn(
                  "w-full px-3 py-2 text-left text-sm text-text transition-colors hover:bg-surface-2",
                  busy && "opacity-50",
                )}
              >
                {m.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Отмена
      </Button>
    </div>
  );
}
