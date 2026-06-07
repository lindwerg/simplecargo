"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/Money";
import { ErrorState } from "@/components/ui/ErrorState";
import { RateInput } from "@/components/common/RateInput";

// A monthly rate as serialized for the client (numeric columns arrive as strings).
export interface MonthlyRateView {
  id: string;
  effectiveMonth: string;
  rateClient: string | null;
  rateOwner: string | null;
  status: string;
}

interface MonthlyRateGridProps {
  directionId: string;
  rates: MonthlyRateView[];
}

function num(v: string | null): number | null {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const MONTHS_RU = [
  "янв",
  "фев",
  "мар",
  "апр",
  "май",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
];

// "2026-05" → "май 2026". Falls back to the raw value if it is not a YYYY-MM string.
function monthLabel(m: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(m);
  if (!match) return m;
  const idx = Number(match[2]) - 1;
  return `${MONTHS_RU[idx] ?? match[2]} ${match[1]}`;
}

// Next calendar month (MSK-agnostic; uses UTC parts) as the default «согласовать заранее».
function nextMonth(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const SAVE_ERROR = "Не удалось сохранить ставку. Проверьте поля.";

// Compact per-month rate grid for a direction, shown inside the «Заявка» sub-tab. Lists
// each month's client/owner rate and the per-month margin; lets the operator agree a rate
// for an upcoming month ahead of time (the rate for May is agreed at the end of April).
export function MonthlyRateGrid({ directionId, rates }: MonthlyRateGridProps) {
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);

  return (
    <div className="space-y-2 rounded-lg border border-border-subtle bg-surface-1 p-3">
      <div className="flex items-center justify-between">
        <span className="label-caps inline-flex items-center gap-1.5">
          <CalendarClock className="size-3.5 text-text-tertiary" aria-hidden />
          Ставки по месяцам
        </span>
        {!adding && (
          <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
            <Plus />
            Согласовать ставку на месяц
          </Button>
        )}
      </div>

      {rates.length === 0 && !adding && (
        <p className="text-2xs text-text-tertiary">
          Помесячных ставок нет. Ставку на следующий месяц согласуют заранее — например, на май в
          конце апреля.
        </p>
      )}

      {rates.length > 0 && (
        <div className="overflow-hidden rounded-md border border-border-subtle">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left">
                <th className="label-caps px-3 py-2 font-medium">Месяц</th>
                <th className="label-caps px-3 py-2 text-right font-medium">Клиент</th>
                <th className="label-caps px-3 py-2 text-right font-medium">Собственник</th>
                <th className="label-caps px-3 py-2 text-right font-medium">Маржа</th>
                <th className="label-caps px-3 py-2 font-medium">Статус</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => (
                <RateRow key={r.id} directionId={directionId} rate={r} onChanged={() => router.refresh()} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding && (
        <AddRateForm
          directionId={directionId}
          existingMonths={rates.map((r) => r.effectiveMonth)}
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function RateRow({
  directionId,
  rate,
  onChanged,
}: {
  directionId: string;
  rate: MonthlyRateView;
  onChanged: () => void;
}) {
  const [pending, setPending] = React.useState(false);
  const client = num(rate.rateClient);
  const owner = num(rate.rateOwner);
  const margin = client !== null && owner !== null ? client - owner : null;
  const agreed = rate.status === "agreed";

  async function agree() {
    setPending(true);
    const res = await fetch(`/api/directions/${directionId}/monthly-rates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ effectiveMonth: rate.effectiveMonth, agree: true }),
    });
    if (res.ok) onChanged();
    else setPending(false);
  }

  return (
    <tr className="border-b border-border-subtle last:border-0">
      <td className="px-3 py-2 text-text">{monthLabel(rate.effectiveMonth)}</td>
      <td className="px-3 py-2 text-right">
        {client !== null ? <Money value={client} /> : <span className="text-text-tertiary">—</span>}
      </td>
      <td className="px-3 py-2 text-right">
        {owner !== null ? <Money value={owner} /> : <span className="text-text-tertiary">—</span>}
      </td>
      <td className="px-3 py-2 text-right">
        {margin !== null ? <Money value={margin} sign /> : <span className="text-text-tertiary">—</span>}
      </td>
      <td className="px-3 py-2">
        {agreed ? (
          <span className="inline-flex items-center gap-1 text-2xs text-[var(--color-success,#16a34a)]">
            <Check className="size-3" aria-hidden />
            согласовано
          </span>
        ) : (
          <button
            type="button"
            onClick={agree}
            disabled={pending}
            className="text-2xs text-accent transition-colors hover:underline disabled:opacity-50"
          >
            согласовать
          </button>
        )}
      </td>
    </tr>
  );
}

function AddRateForm({
  directionId,
  existingMonths,
  onCancel,
  onSaved,
}: {
  directionId: string;
  existingMonths: string[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [month, setMonth] = React.useState(nextMonth());
  const [rateClient, setRateClient] = React.useState("");
  const [rateOwner, setRateOwner] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const clientN = num(rateClient);
  const ownerN = num(rateOwner);
  const previewMargin = clientN !== null && ownerN !== null ? clientN - ownerN : null;

  async function submit(e: React.FormEvent<HTMLFormElement>, agree: boolean) {
    e.preventDefault();
    setError(null);

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      setError("Месяц в формате ГГГГ-ММ");
      return;
    }
    if (existingMonths.includes(month)) {
      // Upsert would overwrite silently; warn the operator instead.
      setError("Ставка на этот месяц уже есть — измените существующую строку.");
      return;
    }

    setPending(true);
    try {
      const res = await fetch(`/api/directions/${directionId}/monthly-rates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          effectiveMonth: month,
          rateClient: rateClient.trim() || undefined,
          rateOwner: rateOwner.trim() || undefined,
          agree,
        }),
      });
      const json: { success: boolean; error?: string } = await res
        .json()
        .catch(() => ({ success: false }));
      if (!res.ok || !json.success) {
        setError(json.error ?? SAVE_ERROR);
        setPending(false);
        return;
      }
      onSaved();
    } catch {
      setError(SAVE_ERROR);
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => submit(e, true)} className="space-y-3 rounded-md border border-border bg-surface-2 p-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <span className="label-caps">Месяц</span>
          <input
            type="month"
            aria-label="Месяц"
            value={month}
            disabled={pending}
            onChange={(e) => setMonth(e.target.value)}
            className="h-11 w-full rounded-[var(--radius-sm)] border border-border bg-surface-inset px-2.5 text-sm text-text tabular-nums outline-none focus-visible:border-accent focus-visible:[box-shadow:var(--ring-focus)] md:h-9"
          />
        </div>
        <RateInput
          label="Ставка клиента"
          unit="₽ / ваг"
          value={rateClient}
          onChange={setRateClient}
          disabled={pending}
        />
        <RateInput
          label="Ставка собственника"
          unit="₽ / ваг"
          value={rateOwner}
          onChange={setRateOwner}
          disabled={pending}
        />
      </div>

      <div className="flex items-center gap-3 text-sm text-text-secondary">
        <span className="label-caps">Маржа</span>
        {previewMargin !== null ? (
          <Money value={previewMargin} sign />
        ) : (
          <span className="text-text-tertiary">—</span>
        )}
      </div>

      {error && <ErrorState message={error} />}

      <p className="text-2xs text-text-tertiary">
        Ставку на следующий месяц согласуют заранее. «Согласовать» фиксирует ставку (proposed →
        agreed); только согласованные ставки попадают в расчёт рейсов.
      </p>

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Сохраняем…" : "Согласовать"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={(e) => submit(e as unknown as React.FormEvent<HTMLFormElement>, false)}
        >
          Сохранить как черновик
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
          Отмена
        </Button>
      </div>
    </form>
  );
}
