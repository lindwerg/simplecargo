"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";

const fieldClass =
  "w-full rounded-md border border-border bg-surface-inset px-3 py-2.5 text-sm text-text " +
  "placeholder:text-text-tertiary outline-none transition-[border-color,box-shadow] " +
  "focus-visible:border-accent focus-visible:[box-shadow:var(--ring-focus)]";
const labelClass = "block text-sm font-medium text-text-secondary";

export interface CounterpartyOption {
  id: string;
  name: string;
}

type ClientMode = "none" | "existing" | "new";
type DealType = "stone_only" | "wagons_only" | "stone_with_transport";

const DEAL_TYPES: readonly [DealType, string][] = [
  ["stone_only", "Щебень"],
  ["wagons_only", "Вагоны"],
  ["stone_with_transport", "Щебень в вагонах"],
];

const SUBMIT_ERROR = "Не удалось создать сделку. Проверьте поля и попробуйте снова.";

interface NewDealFormProps {
  counterparties: CounterpartyOption[];
}

export function NewDealForm({ counterparties }: NewDealFormProps) {
  const router = useRouter();

  const [title, setTitle] = React.useState("");
  const [dealType, setDealType] = React.useState<DealType | "">("");
  const [notes, setNotes] = React.useState("");

  const [clientMode, setClientMode] = React.useState<ClientMode>("none");
  const [clientId, setClientId] = React.useState("");
  const [clientNewName, setClientNewName] = React.useState("");
  const [clientNewInn, setClientNewInn] = React.useState("");

  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = React.useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError(null);
      setPending(true);

      const client =
        clientMode === "existing" && clientId
          ? { id: clientId }
          : clientMode === "new" && clientNewName.trim()
            ? { name: clientNewName.trim(), inn: clientNewInn.trim() || undefined }
            : undefined;

      const payload = {
        title: title.trim() || undefined,
        dealType: dealType || undefined,
        notes: notes.trim() || undefined,
        client,
      };

      try {
        const res = await fetch("/api/deals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json: { success: boolean; data?: { id: string }; error?: string } = await res
          .json()
          .catch(() => ({ success: false }));
        if (!res.ok || !json.success || !json.data) {
          setError(json.error ?? SUBMIT_ERROR);
          setPending(false);
          return;
        }
        router.push(`/deals/${json.data.id}?tab=application`);
        router.refresh();
      } catch {
        setError(SUBMIT_ERROR);
        setPending(false);
      }
    },
    [title, dealType, notes, clientMode, clientId, clientNewName, clientNewInn, router],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-[var(--space-section)]" noValidate>
      <section className="space-y-5">
        <h2 className="label-caps">Сделка</h2>
        <div className="space-y-1.5">
          <label htmlFor="title" className={labelClass}>
            Название
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={pending}
            className={fieldClass}
            placeholder="Щебень Асбест → Тюмень"
          />
        </div>

        <div className="space-y-2">
          <span className={labelClass}>Тип сделки</span>
          <div className="flex flex-wrap gap-2">
            {DEAL_TYPES.map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setDealType((prev) => (prev === value ? "" : value))}
                disabled={pending}
                aria-pressed={dealType === value}
                className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  dealType === value
                    ? "border-accent bg-accent/10 text-text"
                    : "border-border text-text-secondary hover:text-text"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-sm text-text-tertiary">
            Уточняется автоматически по составу сделки — направлениям и щебню.
          </p>
        </div>
      </section>

      <section className="space-y-5">
        <div>
          <h2 className="label-caps">Клиент</h2>
          <p className="mt-1 text-sm text-text-tertiary">
            Предполагаемый клиент — справочно. Подтверждается на направлении.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              ["none", "Не указывать"],
              ["existing", "Существующий"],
              ["new", "Новый"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setClientMode(mode)}
              disabled={pending}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                clientMode === mode
                  ? "border-accent bg-accent/10 text-text"
                  : "border-border text-text-secondary hover:text-text"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {clientMode === "existing" && (
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            disabled={pending}
            className={fieldClass}
            aria-label="Клиент"
          >
            <option value="">— выберите контрагента —</option>
            {counterparties.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}

        {clientMode === "new" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="client-name" className={labelClass}>
                Название
              </label>
              <input
                id="client-name"
                value={clientNewName}
                onChange={(e) => setClientNewName(e.target.value)}
                disabled={pending}
                className={fieldClass}
                placeholder="ООО «Ромашка»"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="client-inn" className={labelClass}>
                ИНН
              </label>
              <input
                id="client-inn"
                value={clientNewInn}
                onChange={(e) => setClientNewInn(e.target.value)}
                disabled={pending}
                className={fieldClass}
                placeholder="необязательно"
              />
            </div>
          </div>
        )}
      </section>

      <section className="space-y-1.5">
        <label htmlFor="notes" className={labelClass}>
          Заметки
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={pending}
          rows={3}
          className={fieldClass}
          placeholder="Контекст сделки, договорённости…"
        />
      </section>

      {error && <ErrorState message={error} />}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Создаём…" : "Создать сделку"}
        </Button>
      </div>
    </form>
  );
}
