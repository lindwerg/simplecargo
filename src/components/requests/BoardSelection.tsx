"use client";

// Board-level multi-select (operator decision: directions from DIFFERENT uploads
// can be mixed into one owner letter / КП). Wraps the active board: a checkbox on
// each card + a sticky action bar. Withdraw is grouped by request and dispatched to
// the per-request /lines endpoint; the owner letter is built client-side from the
// selected cards; the КП opens the combined /requests/kp route.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, FileText, X } from "lucide-react";

import { RequestCard } from "./RequestCard";
import {
  groupByClient,
  groupByOriginStation,
  groupByRoad,
  sortByCreatedAt,
  type DirectionCardView,
  type Group,
} from "@/lib/requests/grouping";
import { buildOwnerLetterForRequest, type OwnerLetterRoute } from "@/lib/documents/ownerLetter";
import type { BoardViewMode } from "./BoardView";

const RUB = new Intl.NumberFormat("ru-RU");
const COPIED_RESET_MS = 2000;

const WITHDRAW_REASONS: { value: string; label: string }[] = [
  { value: "no_capacity", label: "Нет парка" },
  { value: "price", label: "Цена" },
  { value: "timing", label: "Сроки" },
  { value: "client_cancelled", label: "Клиент отменил" },
  { value: "competitor", label: "Конкурент" },
  { value: "other", label: "Другое" },
];

interface Props {
  cards: DirectionCardView[];
  view: BoardViewMode;
}

function cardRateText(c: DirectionCardView): string | null {
  if (c.targetRatePerWagon != null && c.targetRatePerWagon > 0) {
    return `${RUB.format(c.targetRatePerWagon)} ₽/ваг`;
  }
  return c.targetRateRaw ?? null;
}

export function BoardSelection({ cards, view }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [reason, setReason] = useState("no_capacity");
  const [showLetter, setShowLetter] = useState(false);
  const [copied, setCopied] = useState(false);

  const byId = useMemo(() => new Map(cards.map((c) => [c.lineId, c])), [cards]);

  const groups: Group[] | null = useMemo(() => {
    if (view === "all") return null;
    if (view === "clients") return groupByClient(cards);
    if (view === "origins") return groupByOriginStation(cards);
    return groupByRoad(cards);
  }, [cards, view]);

  const flat = useMemo(() => (view === "all" ? sortByCreatedAt(cards) : []), [cards, view]);

  const selectedCards = useMemo(
    () => [...selected].map((id) => byId.get(id)).filter((c): c is DirectionCardView => !!c),
    [selected, byId],
  );
  const selectedWagons = selectedCards.reduce((s, c) => s + (c.wagonsRequested ?? 0), 0);
  const distinctRequests = new Set(selectedCards.map((c) => c.requestId)).size;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setWithdrawing(false);
  }
  function toggleMany(ids: string[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }
  function clear() {
    setSelected(new Set());
    setWithdrawing(false);
    setShowLetter(false);
  }

  const ownerLetter = useMemo(() => {
    const routes: OwnerLetterRoute[] = selectedCards.map((c) => ({
      originName: c.originRaw,
      originRoad: c.originRoadRaw,
      destName: c.destRaw,
      destRoad: c.destRoadRaw,
      wagonsCount: c.wagonsRequested,
      cargoName: c.cargoName,
      rateText: cardRateText(c),
    }));
    return buildOwnerLetterForRequest({
      clientName: null,
      wagonTypeLabel: null,
      periodFrom: null,
      periodTo: null,
      notes: null,
      routes,
    });
  }, [selectedCards]);

  async function copyLetter() {
    setError(null);
    try {
      await navigator.clipboard.writeText(ownerLetter);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      setError("Не удалось скопировать — выделите текст письма вручную.");
      setShowLetter(true);
    }
  }

  function openKp() {
    if (selected.size === 0) return;
    router.push(`/requests/kp?lines=${[...selected].join(",")}`);
  }

  async function withdraw() {
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);
    // Group selected lines by their parent request — the transition endpoint is
    // per-request; mixing uploads means several calls.
    const byRequest = new Map<string, string[]>();
    for (const c of selectedCards) {
      const arr = byRequest.get(c.requestId) ?? [];
      arr.push(c.lineId);
      byRequest.set(c.requestId, arr);
    }
    try {
      const results = await Promise.all(
        [...byRequest.entries()].map(([requestId, lineIds]) =>
          fetch(`/api/requests/${requestId}/lines`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lineIds, to: "no_bid", lossReason: reason }),
          }).then((r) => r.json()),
        ),
      );
      const failed = results.find((j) => !j?.success);
      if (failed) throw new Error(failed?.error ?? "Не удалось отозвать часть направлений");
      clear();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  const cardProps = (c: DirectionCardView) => ({
    card: c,
    selectable: true,
    selected: selected.has(c.lineId),
    onToggle: toggle,
  });

  return (
    <div className="flex flex-col gap-8 pb-28">
      {error && (
        <p role="alert" className="rounded-[var(--radius-md)] border border-danger bg-danger-quiet px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {groups ? (
        groups.map((g) => {
          const ids = g.items.map((c) => c.lineId);
          const allOn = ids.every((id) => selected.has(id));
          return (
            <section key={g.key} aria-label={g.label} className="flex flex-col gap-3">
              <header className="flex items-center justify-between gap-4 border-b border-border-strong pb-2">
                <div className="flex min-w-0 items-center gap-2">
                  {g.isTemp && (
                    <span className="shrink-0 rounded-pill bg-warn-quiet px-1.5 py-0.5 text-2xs font-medium uppercase text-warn">
                      врем.
                    </span>
                  )}
                  <h2 className="truncate text-md text-text" style={{ fontWeight: "var(--weight-semibold)" }}>
                    {g.label}
                  </h2>
                  <button
                    type="button"
                    onClick={() => toggleMany(ids, !allOn)}
                    className="shrink-0 text-xs text-accent hover:underline"
                  >
                    {allOn ? "снять" : "выбрать все"}
                  </button>
                </div>
                <div className="flex shrink-0 items-center gap-4 font-mono text-xs tabular-nums text-text-secondary">
                  <span>{g.cardCount} напр.</span>
                  <span className="text-text">{g.totalWagons} ваг</span>
                </div>
              </header>
              <div className="direction-card-grid">
                {g.items.map((c) => (
                  <RequestCard key={c.lineId} {...cardProps(c)} />
                ))}
              </div>
            </section>
          );
        })
      ) : (
        <div className="direction-card-grid">
          {flat.map((c) => (
            <RequestCard key={c.lineId} {...cardProps(c)} />
          ))}
        </div>
      )}

      {/* sticky action bar */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(var(--bottombar-clearance)+env(safe-area-inset-bottom))] z-30 border-t border-border bg-surface-1/95 shadow-[var(--elev-3)] backdrop-blur md:inset-x-0 md:bottom-0 md:rounded-none md:border-x-0 md:[padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 pb-3 pt-3 md:pb-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-text tabular-nums">
                Выбрано: {selected.size} · {selectedWagons} ваг
                {distinctRequests > 1 && (
                  <span className="ml-2 text-2xs font-normal text-warn">из {distinctRequests} заявок</span>
                )}
              </span>
              <button type="button" onClick={clear} className="inline-flex h-9 items-center gap-1 px-2 text-sm text-text-tertiary hover:text-text">
                <X className="size-4" aria-hidden /> Снять
              </button>
            </div>

            {withdrawing ? (
              <div className="flex flex-wrap items-center gap-2 pb-1">
                <span className="text-sm text-text-secondary">Причина:</span>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="h-11 rounded-[var(--radius-sm)] border border-border bg-surface-inset px-2 text-sm text-text md:h-9"
                >
                  {WITHDRAW_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void withdraw()}
                  className="inline-flex h-11 items-center rounded-[var(--radius-md)] bg-danger px-3.5 text-sm font-semibold text-text-inverse hover:opacity-90 disabled:opacity-50 md:h-9"
                >
                  Отозвать {selected.size}
                </button>
                <button type="button" onClick={() => setWithdrawing(false)} className="inline-flex h-11 items-center px-2 text-sm text-text-tertiary hover:text-text md:h-9">
                  Отмена
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 pb-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void copyLetter()}
                  className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] bg-accent px-3.5 text-sm font-semibold text-text-inverse hover:bg-accent-hover disabled:opacity-50 md:h-9"
                >
                  {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                  {copied ? "Скопировано ✓" : "Письмо собственнику"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={openKp}
                  className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface-2 px-3.5 text-sm text-text hover:bg-surface-3 disabled:opacity-50 md:h-9"
                >
                  <FileText className="size-4" aria-hidden /> Сформировать КП
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setWithdrawing(true)}
                  className="inline-flex h-11 items-center rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 text-sm text-text-secondary hover:border-danger hover:text-danger disabled:opacity-50 md:h-9"
                >
                  Отозвать
                </button>
              </div>
            )}

            {showLetter && (
              <textarea
                readOnly
                value={ownerLetter}
                rows={10}
                className="mb-2 w-full resize-y rounded-[var(--radius-md)] border border-border bg-surface-inset p-3 font-mono text-xs leading-relaxed text-text-secondary focus:outline-none"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
