"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Link2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Match {
  id: string;
  label: string;
}

interface LinkDealControlProps {
  emailId: string;
  directionId: string | null;
  directionLabel: string | null;
}

/** Привязка письма к направлению (сделке): поиск → выбор → POST. Если уже
 *  привязано — показывает подпись сделки и «Отвязать». Mirrors ReconcileControl. */
export function LinkDealControl({ emailId, directionId, directionLabel }: LinkDealControlProps) {
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
      const res = await fetch(`/api/deals/search?q=${encodeURIComponent(q)}&limit=8`);
      const json: { success: boolean; data?: { matches: Match[] } } = await res.json();
      setResults(json.data?.matches ?? []);
    } catch {
      setResults([]);
    }
  }

  async function link(targetDirectionId: string | null) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/inbox/${emailId}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directionId: targetDirectionId }),
      });
      const json: { success: boolean; error?: string } = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Ошибка");
      setOpen(false);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Не удалось привязать");
    } finally {
      setBusy(false);
    }
  }

  if (directionId && !open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm text-text">
          <Check className="size-4 text-success" aria-hidden />
          Сделка: {directionLabel ?? "направление"}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={() => link(null)} disabled={busy}>
          <X aria-hidden /> Отвязать
        </Button>
      </div>
    );
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Link2 aria-hidden /> Привязать к сделке
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <input
        type="text"
        autoFocus
        value={query}
        onChange={(e) => search(e.target.value)}
        placeholder="Поиск сделки/направления (станция, маршрут)"
        className="w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-text outline-none focus-visible:[box-shadow:var(--ring-focus)]"
      />
      {results.length > 0 && (
        <ul className="max-h-56 divide-y divide-border-subtle overflow-auto rounded-md border border-border">
          {results.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => link(m.id)}
                className={cn(
                  "w-full px-3 py-2 text-left text-sm text-text transition-colors hover:bg-surface-2",
                  busy && "opacity-50",
                )}
              >
                {m.label}
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
