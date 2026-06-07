"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Link2, PackagePlus, Train } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LinkDealControl } from "@/components/inbox/LinkDealControl";
import { cn } from "@/lib/utils";

interface DirectionMatch {
  id: string;
  label: string;
}

interface WagonLine {
  number: string;
  loaded: boolean | null;
}

interface DislocationSummary {
  wagons: WagonLine[];
  total: number;
  loaded: number;
  empty: number;
}

interface LetterActionsProps {
  emailId: string;
  directionId: string | null;
  directionLabel: string | null;
}

/** Блок «Действия» на странице письма: создать запрос/заявку из письма (форма с
 *  ИИ-предзаполнением), привязать к направлению, разобрать дислокацию в направление
 *  (пономерной список + счётчики). */
export function LetterActions({ emailId, directionId, directionLabel }: LetterActionsProps) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface-2 p-4">
      <div className="space-y-2">
        <p className="label-caps">Действия</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/requests/new?emailId=${emailId}`}>
              <FileText aria-hidden /> Создать запрос
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/requests/new?emailId=${emailId}&target=deal`}>
              <PackagePlus aria-hidden /> Создать заявку
            </Link>
          </Button>
        </div>
      </div>

      <div className="space-y-1.5 border-t border-border-subtle pt-3">
        <p className="label-caps">Сделка / направление</p>
        <LinkDealControl emailId={emailId} directionId={directionId} directionLabel={directionLabel} />
      </div>

      <div className="space-y-1.5 border-t border-border-subtle pt-3">
        <p className="label-caps">Дислокация</p>
        <DislocationControl emailId={emailId} />
      </div>
    </section>
  );
}

/** Привязка письма-дислокации к направлению с разбором пономерного списка вагонов. */
function DislocationControl({ emailId }: { emailId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirectionMatch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<DislocationSummary | null>(null);
  const [savedToBinding, setSavedToBinding] = useState(false);

  async function search(q: string) {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    try {
      const res = await fetch(`/api/deals/search?q=${encodeURIComponent(q)}&limit=8`);
      const json: { success: boolean; data?: { matches: DirectionMatch[] } } = await res.json();
      setResults(json.data?.matches ?? []);
    } catch {
      setResults([]);
    }
  }

  async function attach(directionId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/inbox/${emailId}/dislocation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directionId }),
      });
      const json: {
        success: boolean;
        error?: string;
        data?: { summary: DislocationSummary; savedToBinding: boolean };
      } = await res.json();
      if (!res.ok || !json.success || !json.data) throw new Error(json.error ?? "Ошибка");
      setSummary(json.data.summary);
      setSavedToBinding(json.data.savedToBinding);
      setOpen(false);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Не удалось привязать дислокацию");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {!open && (
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Train aria-hidden /> Дислокация в направление
        </Button>
      )}

      {open && (
        <div className="space-y-2">
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder="Направление для дислокации (станция, маршрут)"
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
                    {m.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
            Отмена
          </Button>
        </div>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}

      {summary && (
        <div className="space-y-2 rounded-md border border-border bg-surface-1 p-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text">
            <span className="inline-flex items-center gap-1.5">
              <Link2 className="size-4 text-success" aria-hidden />
              Привязано к направлению
            </span>
            <span className="text-text-secondary">
              Всего: <b className="tabular-nums">{summary.total}</b>
            </span>
            <span className="text-text-secondary">
              Гружёных: <b className="tabular-nums">{summary.loaded}</b>
            </span>
            <span className="text-text-secondary">
              Порожних: <b className="tabular-nums">{summary.empty}</b>
            </span>
          </div>
          {!savedToBinding && summary.total > 0 && (
            <p className="text-xs text-text-tertiary">
              Список вагонов показан, но не записан в направление: у направления нет единственной
              активной привязки владельца. Привяжите владельца — и номера разложатся по схеме.
            </p>
          )}
          {summary.total > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {summary.wagons.map((w) => (
                <li
                  key={w.number}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-pill border border-border px-2 py-0.5 text-2xs tabular-nums",
                    w.loaded === true && "bg-surface-3 text-text",
                    w.loaded === false && "bg-surface-1 text-text-tertiary",
                    w.loaded == null && "bg-surface-1 text-text-secondary",
                  )}
                  title={w.loaded === true ? "Гружёный" : w.loaded === false ? "Порожний" : "Состояние неизвестно"}
                >
                  {w.number}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-text-tertiary">
              Номеров вагонов в письме не нашли — проверьте, что дислокация во вложении-таблице.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
