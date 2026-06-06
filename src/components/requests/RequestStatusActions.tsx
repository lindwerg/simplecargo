"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { TRANSITIONS, type RequestStatus } from "@/lib/requests/lifecycle";
import { ClientPicker, type ClientValue } from "./ClientPicker";

const TARGET_LABEL: Record<RequestStatus, string> = {
  new: "Новый",
  sourcing: "Начать опрос",
  quoted: "Отправить котировку",
  won: "Выигран",
  lost: "Проигрыш",
  no_bid: "Не беремся",
  expired: "Истёк",
  cancelled: "Отозвать",
};

const LOSS_REASONS: { value: string; label: string }[] = [
  { value: "price", label: "Цена" },
  { value: "no_capacity", label: "Нет вагонов" },
  { value: "client_cancelled", label: "Клиент отменил" },
  { value: "timing", label: "Сроки" },
  { value: "competitor", label: "Конкурент" },
  { value: "other", label: "Другое" },
];

interface Props {
  id: string;
  status: RequestStatus;
  isTemp: boolean;
}

export function RequestStatusActions({ id, status, isTemp }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<RequestStatus | null>(null);
  const [reason, setReason] = useState("price");
  const [client, setClient] = useState<ClientValue>(null);
  const [linkOpen, setLinkOpen] = useState(false);

  const targets = TRANSITIONS[status] ?? [];

  async function patch(body: object) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error ?? "Не удалось");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  function onTarget(to: RequestStatus) {
    if (to === "lost" || to === "no_bid") {
      setPending(to);
    } else {
      void patch({ to });
    }
  }

  async function linkClient() {
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      const counterparty = client.kind === "existing" ? { id: client.id } : { name: client.name };
      const res = await fetch(`/api/requests/${id}/link-client`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counterparty }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error ?? "Не удалось");
      setLinkOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Удалить запрос безвозвратно?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/requests/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error ?? "Не удалось");
      router.push("/requests/actual");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="rounded-[var(--radius-md)] border border-danger bg-danger-quiet px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {targets.map((to) => {
          const danger = to === "lost" || to === "cancelled" || to === "no_bid";
          const primary = to === "sourcing" || to === "quoted" || to === "won";
          return (
            <button
              key={to}
              type="button"
              disabled={busy}
              onClick={() => onTarget(to)}
              className={cn(
                "inline-flex h-11 items-center rounded-[var(--radius-md)] px-3.5 text-sm font-medium disabled:opacity-50 focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] md:h-9",
                primary && "bg-accent text-text-inverse hover:bg-accent-hover",
                danger && "border border-border bg-surface-2 text-text-secondary hover:border-danger hover:text-danger",
                !primary && !danger && "border border-border bg-surface-2 text-text hover:bg-surface-3",
              )}
            >
              {TARGET_LABEL[to]}
            </button>
          );
        })}
        {status === "new" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className="inline-flex h-11 items-center rounded-[var(--radius-md)] px-3 text-sm text-text-tertiary hover:text-danger md:h-9"
          >
            Удалить
          </button>
        )}
      </div>

      {pending && (
        <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
          <span className="text-sm text-text-secondary">Причина:</span>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="h-11 rounded-[var(--radius-sm)] border border-border bg-surface-inset px-2 text-sm text-text md:h-9"
          >
            {LOSS_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={() => void patch({ to: pending, lossReason: reason })}
            className="inline-flex h-11 items-center rounded-[var(--radius-md)] bg-accent px-3.5 text-sm font-semibold text-text-inverse hover:bg-accent-hover md:h-9"
          >
            Подтвердить
          </button>
          <button type="button" onClick={() => setPending(null)} className="inline-flex h-11 items-center px-2 text-sm text-text-tertiary hover:text-text md:h-9">
            Отмена
          </button>
        </div>
      )}

      {isTemp && (
        <div className="flex flex-col gap-2">
          {linkOpen ? (
            <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
              <ClientPicker value={client} onChange={setClient} />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy || !client}
                  onClick={() => void linkClient()}
                  className="inline-flex h-11 items-center rounded-[var(--radius-md)] bg-accent px-3.5 text-sm font-semibold text-text-inverse disabled:opacity-50 hover:bg-accent-hover md:h-9"
                >
                  Привязать
                </button>
                <button type="button" onClick={() => setLinkOpen(false)} className="inline-flex h-11 items-center px-2 text-sm text-text-tertiary hover:text-text md:h-9">
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setLinkOpen(true)}
              className="inline-flex h-11 items-center self-start rounded-[var(--radius-md)] border border-border bg-surface-2 px-3.5 text-sm text-text hover:bg-surface-3 md:h-9"
            >
              Привязать клиента
            </button>
          )}
        </div>
      )}
    </div>
  );
}
