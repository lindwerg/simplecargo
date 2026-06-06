"use client";

// Per-direction worklist (the heart of the direction-worklist redesign). Each row
// is ONE direction with its own status; selection (one / several / all) is the
// primary primitive that scopes the owner letter, the КП, and withdrawal. A tap on
// a board card deep-links here via #line-{id}, which auto-scrolls + preselects that
// one direction. Request-level withdraw/cancel buttons are gone — everything is
// per-direction now.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, FileText, ChevronDown, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Money } from "@/components/ui/Money";
import { StatusPill, type RequestStatus } from "@/components/ui/StatusPill";
import { isActive } from "@/lib/requests/lifecycle";
import { buildOwnerLetterForRequest, type OwnerLetterRoute } from "@/lib/documents/ownerLetter";

const COPIED_RESET_MS = 2000;

const WITHDRAW_REASONS: { value: string; label: string }[] = [
  { value: "no_capacity", label: "Нет парка" },
  { value: "price", label: "Цена" },
  { value: "timing", label: "Сроки" },
  { value: "client_cancelled", label: "Клиент отменил" },
  { value: "competitor", label: "Конкурент" },
  { value: "other", label: "Другое" },
];

export interface WorklistLine {
  id: string;
  status: RequestStatus;
  originRaw: string;
  originRoadRaw: string | null;
  destRaw: string;
  destRoadRaw: string | null;
  cargoName: string | null;
  wagonType: string;
  wagonsRequested: number;
  targetRatePerWagon: number | null;
  targetRateRaw: string | null;
  rateText: string | null; // resolved rate text for the owner letter
  lossReason: string | null;
  kpIssued: boolean;
}

interface LetterContext {
  clientName: string | null;
  wagonTypeLabel: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  notes: string | null;
}

interface Props {
  requestId: string;
  lines: WorklistLine[];
  letterContext: LetterContext;
}

type Mode = "idle" | "withdraw" | "letter";

export function RequestWorklist({ requestId, lines, letterContext }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [reason, setReason] = useState("no_capacity");
  const [copied, setCopied] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  const activeIds = useMemo(() => lines.filter((l) => isActive(l.status)).map((l) => l.id), [lines]);

  // Deep-link from a board card: #line-{id} → scroll to + preselect that direction.
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith("#line-")) return;
    const id = hash.slice("#line-".length);
    if (!lines.some((l) => l.id === id)) return;
    setSelected(new Set([id]));
    setHighlight(id);
    const el = rowRefs.current.get(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setHighlight(null), 2400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedLines = useMemo(() => lines.filter((l) => selected.has(l.id)), [lines, selected]);
  const selectedWagons = selectedLines.reduce((s, l) => s + (l.wagonsRequested ?? 0), 0);
  const allNew = lines.every((l) => l.status === "new");

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setMode("idle");
  }

  function selectAll() {
    setSelected(new Set(lines.map((l) => l.id)));
  }
  function selectActive() {
    setSelected(new Set(activeIds));
  }
  function clear() {
    setSelected(new Set());
    setMode("idle");
  }

  async function transition(to: RequestStatus, lossReason?: string) {
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/requests/${requestId}/lines`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineIds: [...selected], to, lossReason }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error ?? "Не удалось");
      clear();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  const ownerLetter = useMemo(() => {
    const routes: OwnerLetterRoute[] = selectedLines.map((l) => ({
      originName: l.originRaw,
      originRoad: l.originRoadRaw,
      destName: l.destRaw,
      destRoad: l.destRoadRaw,
      wagonsCount: l.wagonsRequested,
      cargoName: l.cargoName,
      rateText: l.rateText,
    }));
    return buildOwnerLetterForRequest({
      clientName: letterContext.clientName,
      wagonTypeLabel: letterContext.wagonTypeLabel,
      periodFrom: letterContext.periodFrom,
      periodTo: letterContext.periodTo,
      notes: letterContext.notes,
      routes,
    });
  }, [selectedLines, letterContext]);

  async function copyLetter() {
    setError(null);
    try {
      await navigator.clipboard.writeText(ownerLetter);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      setError("Не удалось скопировать — выделите текст письма вручную.");
    }
  }

  function openKp() {
    if (selected.size === 0) return;
    router.push(`/requests/${requestId}/kp?lines=${[...selected].join(",")}`);
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="label-caps">Направления</h2>
        <div className="flex items-center gap-3 text-xs text-text-tertiary">
          <span className="tabular-nums">
            {selected.size > 0 ? `Выбрано ${selected.size} из ${lines.length}` : `${lines.length} напр.`}
          </span>
          <button type="button" onClick={selectActive} className="h-9 text-accent hover:underline">
            Выбрать активные
          </button>
          <button type="button" onClick={selectAll} className="h-9 text-accent hover:underline">
            Все
          </button>
          {selected.size > 0 && (
            <button type="button" onClick={clear} className="h-9 text-text-tertiary hover:text-text">
              Снять
            </button>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-[var(--radius-md)] border border-danger bg-danger-quiet px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <ul className="flex flex-col divide-y divide-border-subtle overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-2">
        {lines.map((l) => {
          const checked = selected.has(l.id);
          const terminal = !isActive(l.status);
          return (
            <li
              key={l.id}
              id={`line-${l.id}`}
              ref={(el) => {
                if (el) rowRefs.current.set(l.id, el);
              }}
              className={cn(
                "flex items-start gap-3 px-3 py-3 transition-colors sm:items-center",
                checked && "bg-accent-quiet/40",
                highlight === l.id && "ring-2 ring-accent ring-inset",
                terminal && !checked && "opacity-60",
              )}
            >
              <label className="flex h-11 cursor-pointer items-center md:h-9">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(l.id)}
                  className="size-5 accent-[var(--color-accent)]"
                  aria-label={`Выбрать ${l.originRaw} → ${l.destRaw}`}
                />
              </label>

              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="flex min-w-0 items-baseline gap-1.5" style={{ fontWeight: "var(--weight-semibold)" }}>
                    <span className="min-w-0 truncate text-text">{l.originRaw}</span>
                    <span aria-hidden className="shrink-0 text-accent">→</span>
                    <span className="min-w-0 truncate text-text">{l.destRaw}</span>
                  </span>
                  <StatusPill status={l.status} />
                  {l.kpIssued && (
                    <span className="rounded-pill bg-info-quiet px-1.5 py-0.5 text-2xs font-medium text-info" title="КП по этому направлению уже выпускалось">
                      КП выпущено
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-text-tertiary">
                  {[l.originRoadRaw, l.destRoadRaw].filter(Boolean).join(" → ") || "дороги —"}
                  {l.cargoName ? ` · ${l.cargoName}` : ""}
                  {terminal && l.lossReason ? ` · причина: ${reasonLabel(l.lossReason)}` : ""}
                </p>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="font-mono text-md tabular-nums text-text">{l.wagonsRequested} ваг</span>
                <span className="text-right text-xs">
                  {l.targetRatePerWagon != null ? (
                    <Money value={l.targetRatePerWagon} form="per-wagon" />
                  ) : l.targetRateRaw ? (
                    <span className="font-mono tabular-nums text-text-secondary">{l.targetRateRaw}</span>
                  ) : (
                    <span className="text-text-disabled">ставка —</span>
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {selected.size === 0 && (
        <p className="px-1 text-xs text-text-tertiary">
          Отметьте направления, чтобы сделать <strong className="font-medium text-text-secondary">письмо собственнику</strong>, <strong className="font-medium text-text-secondary">КП</strong> или отозвать. Можно выбрать одно, несколько или все.
        </p>
      )}

      {/* Sticky selection action bar */}
      {selected.size > 0 && (
        <div className="sticky bottom-0 z-10 -mx-1 flex flex-col gap-2 rounded-[var(--radius-lg)] border border-border bg-surface-1/95 p-3 shadow-lg backdrop-blur [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-text tabular-nums">
              Выбрано: {selected.size} · {selectedWagons} ваг
            </span>
            <button type="button" onClick={clear} className="inline-flex h-9 items-center gap-1 px-2 text-sm text-text-tertiary hover:text-text">
              <X className="size-4" aria-hidden /> Снять выбор
            </button>
          </div>

          {mode === "withdraw" ? (
            <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface-2 p-2">
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
                onClick={() => void transition("no_bid", reason)}
                className="inline-flex h-11 items-center rounded-[var(--radius-md)] bg-danger px-3.5 text-sm font-semibold text-text-inverse hover:opacity-90 disabled:opacity-50 md:h-9"
              >
                Отозвать {selected.size}
              </button>
              <button type="button" onClick={() => setMode("idle")} className="inline-flex h-11 items-center px-2 text-sm text-text-tertiary hover:text-text md:h-9">
                Отмена
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setMode(mode === "letter" ? "idle" : "letter")}
                className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] bg-accent px-3.5 text-sm font-semibold text-text-inverse hover:bg-accent-hover disabled:opacity-50 md:h-9"
              >
                <Copy className="size-4" aria-hidden /> Письмо собственнику
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={openKp}
                className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface-2 px-3.5 text-sm text-text hover:bg-surface-3 disabled:opacity-50 md:h-9"
              >
                <FileText className="size-4" aria-hidden /> Сформировать КП
              </button>
              <span className="mx-1 hidden h-6 w-px bg-border sm:block" aria-hidden />
              <button
                type="button"
                disabled={busy}
                onClick={() => void transition("sourcing")}
                className="inline-flex h-11 items-center rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 text-sm text-text hover:bg-surface-3 disabled:opacity-50 md:h-9"
              >
                В опрос
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void transition("quoted")}
                className="inline-flex h-11 items-center rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 text-sm text-text hover:bg-surface-3 disabled:opacity-50 md:h-9"
              >
                Котировка готова
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setMode("withdraw")}
                className="inline-flex h-11 items-center rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 text-sm text-text-secondary hover:border-danger hover:text-danger disabled:opacity-50 md:h-9"
              >
                Отозвать
              </button>
            </div>
          )}

          {mode === "letter" && (
            <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-border bg-surface-2 p-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void copyLetter()}
                  className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] bg-accent px-3.5 text-sm font-semibold text-text-inverse hover:bg-accent-hover md:h-9"
                >
                  {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                  {copied ? "Скопировано ✓" : `Скопировать письмо (${selected.size} напр.)`}
                </button>
                <ChevronDown className="size-4 text-text-tertiary" aria-hidden />
              </div>
              <textarea
                readOnly
                value={ownerLetter}
                rows={12}
                className="w-full resize-y rounded-[var(--radius-md)] border border-border bg-surface-inset p-3 font-mono text-xs leading-relaxed text-text-secondary focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
              />
            </div>
          )}
        </div>
      )}

      {allNew && (
        <p className="px-1 text-2xs text-text-disabled">
          Пока все направления новые, можно удалить весь запрос целиком (кнопка выше).
        </p>
      )}
    </section>
  );
}

function reasonLabel(value: string): string {
  return WITHDRAW_REASONS.find((r) => r.value === value)?.label ?? value;
}
