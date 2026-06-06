"use client";

// Request-level actions only. Lifecycle transitions (sourcing / quoted / withdraw)
// moved onto the DIRECTION (see RequestWorklist) — this panel now keeps just the
// two genuinely whole-request actions: link a TEMP client, and delete the entire
// request while every direction is still new.

import { useState } from "react";
import { useRouter } from "next/navigation";

import { type RequestStatus } from "@/lib/requests/lifecycle";
import { ClientPicker, type ClientValue } from "./ClientPicker";

interface Props {
  id: string;
  status: RequestStatus;
  isTemp: boolean;
}

export function RequestStatusActions({ id, status, isTemp }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<ClientValue>(null);
  const [linkOpen, setLinkOpen] = useState(false);

  // Header status is now a rollup; "new" means every direction is still new.
  const deletable = status === "new";

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
    if (!confirm("Удалить весь запрос безвозвратно? (доступно, пока все направления новые)")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/requests/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error ?? "Не удалось");
      router.push("/requests");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
      setBusy(false);
    }
  }

  if (!isTemp && !deletable) return null;

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="rounded-[var(--radius-md)] border border-danger bg-danger-quiet px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {isTemp && !linkOpen && (
          <button
            type="button"
            onClick={() => setLinkOpen(true)}
            className="inline-flex h-11 items-center rounded-[var(--radius-md)] border border-border bg-surface-2 px-3.5 text-sm text-text hover:bg-surface-3 md:h-9"
          >
            Привязать клиента
          </button>
        )}
        {deletable && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className="inline-flex h-11 items-center rounded-[var(--radius-md)] px-3 text-sm text-text-tertiary hover:text-danger md:h-9"
          >
            Удалить запрос
          </button>
        )}
      </div>

      {isTemp && linkOpen && (
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
      )}
    </div>
  );
}
