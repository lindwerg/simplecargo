"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2 } from "lucide-react";

// Ручная привязка карантинного ответа перевозчика (CARRIER_QUOTE_MANUAL) к
// запросу: пикер запроса (поиск по номеру/клиенту среди активных) + перевозчик
// (по умолчанию — авто по from-адресу письма) → POST /api/quarantine/:id/attach-quote.

interface DirectionCard {
  requestId: string;
  requestNumber: string | null;
  clientName: string | null;
  clientRaw: string | null;
  originRaw: string;
  destRaw: string;
}

interface CounterpartyOption {
  id: string;
  name: string;
  roles: string[];
}

interface RequestOption {
  id: string;
  label: string;
}

interface AttachQuoteFormProps {
  quarantineId: number;
  senderEmail: string | null;
}

const AUTO_CARRIER = "__auto__";

export function AttachQuoteForm({ quarantineId, senderEmail }: AttachQuoteFormProps) {
  const router = useRouter();
  const [requests, setRequests] = useState<RequestOption[]>([]);
  const [carriers, setCarriers] = useState<CounterpartyOption[]>([]);
  const [query, setQuery] = useState("");
  const [requestId, setRequestId] = useState("");
  const [carrierId, setCarrierId] = useState(AUTO_CARRIER);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // активные запросы: карточки направлений → дедуп по requestId
    fetch("/api/requests?bucket=active")
      .then((r) => r.json())
      .then((j: { success: boolean; data?: DirectionCard[] }) => {
        if (cancelled || !j?.success || !j.data) return;
        const byRequest = new Map<string, RequestOption>();
        for (const card of j.data) {
          if (byRequest.has(card.requestId)) continue;
          const client = card.clientName ?? card.clientRaw;
          byRequest.set(card.requestId, {
            id: card.requestId,
            label: [card.requestNumber ?? "Запрос", client, `${card.originRaw} → ${card.destRaw}`]
              .filter(Boolean)
              .join(" · "),
          });
        }
        setRequests([...byRequest.values()]);
      })
      .catch(() => {});
    fetch("/api/counterparties")
      .then((r) => r.json())
      .then((j: { success: boolean; data?: CounterpartyOption[] }) => {
        if (cancelled || !j?.success || !j.data) return;
        setCarriers(j.data.filter((c) => c.roles.includes("carrier")));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const q = query.trim().toLowerCase();
  const visibleRequests = useMemo(
    () => (q.length > 0 ? requests.filter((r) => r.label.toLowerCase().includes(q)) : requests).slice(0, 30),
    [requests, q],
  );

  async function attach() {
    if (!requestId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/quarantine/${quarantineId}/attach-quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          ...(carrierId !== AUTO_CARRIER ? { ownerId: carrierId } : {}),
        }),
      });
      const json: { success: boolean; error?: string } = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Не удалось привязать");
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1 flex flex-col gap-2 rounded-[var(--radius-md)] border border-border bg-surface-inset p-3">
      <span className="text-2xs font-medium uppercase tracking-wide text-text-tertiary">
        Привязать к запросу
      </span>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Поиск: номер запроса / клиент / станция"
        aria-label="Поиск запроса"
        className="h-9 w-full rounded-[var(--radius-md)] border border-border bg-surface-2 px-2.5 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
      />

      <select
        value={requestId}
        onChange={(e) => setRequestId(e.target.value)}
        aria-label="Запрос"
        className="h-9 w-full rounded-[var(--radius-md)] border border-border bg-surface-2 px-2 text-sm text-text"
      >
        <option value="">— выберите запрос —</option>
        {visibleRequests.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </select>

      <select
        value={carrierId}
        onChange={(e) => setCarrierId(e.target.value)}
        aria-label="Перевозчик"
        className="h-9 w-full rounded-[var(--radius-md)] border border-border bg-surface-2 px-2 text-sm text-text"
      >
        <option value={AUTO_CARRIER}>
          Перевозчик: авто по отправителю{senderEmail ? ` (${senderEmail})` : ""}
        </option>
        {carriers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!requestId || busy}
          onClick={attach}
          className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] bg-accent px-3 text-sm font-semibold text-text-inverse hover:bg-accent-hover disabled:opacity-50"
        >
          <Link2 className="size-4" aria-hidden /> {busy ? "Привязываю…" : "Привязать"}
        </button>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    </div>
  );
}
