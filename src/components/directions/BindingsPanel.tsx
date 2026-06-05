"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import type { CounterpartyOption } from "./DirectionForm";

const fieldClass =
  "w-full rounded-md border border-border bg-surface-inset px-3 py-2.5 text-sm text-text " +
  "placeholder:text-text-tertiary outline-none transition-[border-color,box-shadow] " +
  "focus-visible:border-accent focus-visible:[box-shadow:var(--ring-focus)]";

export interface OwnerBindingView {
  id: string;
  ownerName: string | null;
  inboundMailbox: string;
  status: string;
}
export interface ClientBindingView {
  id: string;
  clientName: string | null;
  forwardToEmail: string;
  status: string;
}

interface BindingsPanelProps {
  directionId: string;
  counterparties: CounterpartyOption[];
  ownerBindings: OwnerBindingView[];
  clientBindings: ClientBindingView[];
}

function useCounterpartyPick(counterparties: CounterpartyOption[]) {
  const [mode, setMode] = React.useState<"existing" | "new">(
    counterparties.length > 0 ? "existing" : "new",
  );
  const [id, setId] = React.useState("");
  const [name, setName] = React.useState("");
  const payload = () =>
    mode === "existing"
      ? id
        ? { id }
        : undefined
      : name.trim()
        ? { name: name.trim() }
        : undefined;
  return { mode, setMode, id, setId, name, setName, payload };
}

export function BindingsPanel({
  directionId,
  counterparties,
  ownerBindings,
  clientBindings,
}: BindingsPanelProps) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const owner = useCounterpartyPick(counterparties);
  const [mailbox, setMailbox] = React.useState("");
  const client = useCounterpartyPick(counterparties);
  const [forwardEmail, setForwardEmail] = React.useState("");

  const send = React.useCallback(
    async (url: string, method: "POST" | "DELETE", body?: unknown) => {
      setError(null);
      setPending(true);
      try {
        const init: RequestInit =
          body !== undefined
            ? { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
            : { method };
        const res = await fetch(url, init);
        const json: { success: boolean; error?: string } = await res
          .json()
          .catch(() => ({ success: false }));
        if (!res.ok || !json.success) {
          setError(json.error ?? "Не удалось выполнить операцию.");
          return false;
        }
        router.refresh();
        return true;
      } catch {
        setError("Сетевая ошибка. Попробуйте снова.");
        return false;
      } finally {
        setPending(false);
      }
    },
    [router],
  );

  const addOwner = async () => {
    const cp = owner.payload();
    if (!cp || !mailbox.trim()) {
      setError("Укажите собственника и входящий ящик.");
      return;
    }
    const ok = await send(`/api/directions/${directionId}/owner-bindings`, "POST", {
      owner: cp,
      inboundMailbox: mailbox.trim(),
    });
    if (ok) setMailbox("");
  };

  const addClient = async () => {
    const cp = client.payload();
    if (!cp || !forwardEmail.trim()) {
      setError("Укажите клиента и адрес пересылки.");
      return;
    }
    const ok = await send(`/api/directions/${directionId}/client-bindings`, "POST", {
      client: cp,
      forwardToEmail: forwardEmail.trim(),
    });
    if (ok) setForwardEmail("");
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="label-caps">Собственник + входящая почта</h3>
        {ownerBindings.length === 0 ? (
          <p className="text-sm text-text-tertiary">Привязок собственника пока нет.</p>
        ) : (
          <ul className="space-y-1.5">
            {ownerBindings.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border-subtle px-3 py-2 text-sm"
              >
                <span className="text-text">
                  {b.ownerName ?? "—"} · <span className="text-text-secondary">{b.inboundMailbox}</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={pending}
                  onClick={() =>
                    send(`/api/directions/${directionId}/owner-bindings/${b.id}`, "DELETE")
                  }
                  aria-label="Удалить привязку собственника"
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          {owner.mode === "existing" ? (
            <select
              aria-label="Собственник"
              value={owner.id}
              onChange={(e) => owner.setId(e.target.value)}
              disabled={pending}
              className={fieldClass}
            >
              <option value="">— собственник —</option>
              {counterparties.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              aria-label="Новый собственник"
              value={owner.name}
              onChange={(e) => owner.setName(e.target.value)}
              disabled={pending}
              className={fieldClass}
              placeholder="Новый собственник"
            />
          )}
          <input
            aria-label="Входящий ящик"
            value={mailbox}
            onChange={(e) => setMailbox(e.target.value)}
            disabled={pending}
            className={fieldClass}
            placeholder="owner@firm.ru"
          />
          <Button type="button" onClick={addOwner} disabled={pending}>
            <Plus />
            Привязать
          </Button>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => owner.setMode(owner.mode === "existing" ? "new" : "existing")}
          disabled={pending || counterparties.length === 0}
        >
          {owner.mode === "existing" ? "Новый собственник" : "Из списка"}
        </Button>
      </div>

      <div className="space-y-3">
        <h3 className="label-caps">Клиент + пересылка</h3>
        {clientBindings.length === 0 ? (
          <p className="text-sm text-text-tertiary">Пересылок клиенту пока нет.</p>
        ) : (
          <ul className="space-y-1.5">
            {clientBindings.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border-subtle px-3 py-2 text-sm"
              >
                <span className="text-text">
                  {b.clientName ?? "—"} ·{" "}
                  <span className="text-text-secondary">{b.forwardToEmail}</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={pending}
                  onClick={() =>
                    send(`/api/directions/${directionId}/client-bindings/${b.id}`, "DELETE")
                  }
                  aria-label="Удалить пересылку клиенту"
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          {client.mode === "existing" ? (
            <select
              aria-label="Клиент"
              value={client.id}
              onChange={(e) => client.setId(e.target.value)}
              disabled={pending}
              className={fieldClass}
            >
              <option value="">— клиент —</option>
              {counterparties.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              aria-label="Новый клиент"
              value={client.name}
              onChange={(e) => client.setName(e.target.value)}
              disabled={pending}
              className={fieldClass}
              placeholder="Новый клиент"
            />
          )}
          <input
            aria-label="Адрес пересылки"
            value={forwardEmail}
            onChange={(e) => setForwardEmail(e.target.value)}
            disabled={pending}
            className={fieldClass}
            placeholder="client@firm.ru"
          />
          <Button type="button" onClick={addClient} disabled={pending}>
            <Plus />
            Привязать
          </Button>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => client.setMode(client.mode === "existing" ? "new" : "existing")}
          disabled={pending || counterparties.length === 0}
        >
          {client.mode === "existing" ? "Новый клиент" : "Из списка"}
        </Button>
      </div>

      {error && <ErrorState message={error} variant="inline" />}
    </div>
  );
}
