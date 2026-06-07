"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/Money";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  CounterpartyPicker,
  type CounterpartyValue,
} from "@/components/common/CounterpartyPicker";
import { StationField, type StationValue } from "@/components/common/StationField";
import { RateInput } from "@/components/common/RateInput";

// A stone line as serialized for the client (numeric columns arrive as strings).
export interface StoneLineView {
  id: string;
  quarryName: string | null;
  quarryRaw: string | null;
  locationRaw: string | null;
  locationEsr: string | null;
  fraction: string | null;
  cargoName: string;
  tonnage: string | null;
  pricePurchase: string | null;
  priceSale: string | null;
  marginPerTon: string | null;
  status: string;
}

interface StoneSectionProps {
  dealId: string;
  lines: StoneLineView[];
}

function num(v: string | null): number | null {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const ADD_ERROR = "Не удалось добавить товарную линию. Проверьте поля.";

export function StoneSection({ dealId, lines }: StoneSectionProps) {
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="label-caps">Щебень</h3>
        {!adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus />
            Добавить линию
          </Button>
        )}
      </div>

      {lines.length === 0 && !adding && (
        <p className="rounded-lg border border-dashed border-border bg-surface-1 px-4 py-5 text-sm text-text-secondary">
          Товарных линий нет. Добавьте карьер, фракцию, тонны и цены закупки/продажи.
        </p>
      )}

      {lines.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-surface-1">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="label-caps px-4 py-2.5 font-medium">Карьер · фракция</th>
                <th className="label-caps px-4 py-2.5 text-right font-medium">Тонн</th>
                <th className="label-caps px-4 py-2.5 text-right font-medium">Закупка</th>
                <th className="label-caps px-4 py-2.5 text-right font-medium">Продажа</th>
                <th className="label-caps px-4 py-2.5 text-right font-medium">Маржа / т</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <StoneRow key={l.id} dealId={dealId} line={l} onChanged={() => router.refresh()} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding && (
        <AddStoneForm
          dealId={dealId}
          onCancel={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}

function StoneRow({
  dealId,
  line,
  onChanged,
}: {
  dealId: string;
  line: StoneLineView;
  onChanged: () => void;
}) {
  const [pending, setPending] = React.useState(false);
  const quarry = line.quarryName ?? line.quarryRaw ?? "карьер не задан";
  const margin = num(line.marginPerTon);

  async function remove() {
    setPending(true);
    const res = await fetch(`/api/deals/${dealId}/stone-lines/${line.id}`, { method: "DELETE" });
    if (res.ok) onChanged();
    else setPending(false);
  }

  return (
    <tr className="border-b border-border-subtle last:border-0">
      <td className="px-4 py-3 text-text">
        {quarry}
        {line.fraction && <span className="ml-1.5 text-text-tertiary">· {line.fraction}</span>}
        {line.locationRaw && (
          <span className="block text-2xs text-text-tertiary">{line.locationRaw}</span>
        )}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
        {line.tonnage ?? "—"}
      </td>
      <td className="px-4 py-3 text-right">
        {num(line.pricePurchase) !== null ? <Money value={num(line.pricePurchase)!} /> : "—"}
      </td>
      <td className="px-4 py-3 text-right">
        {num(line.priceSale) !== null ? <Money value={num(line.priceSale)!} /> : "—"}
      </td>
      <td className="px-4 py-3 text-right">
        {margin !== null ? <Money value={margin} sign /> : "—"}
      </td>
      <td className="px-4 py-3 text-right">
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          aria-label="Удалить линию"
          className="text-text-tertiary transition-colors hover:text-danger disabled:opacity-50"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </td>
    </tr>
  );
}

function AddStoneForm({
  dealId,
  onCancel,
  onAdded,
}: {
  dealId: string;
  onCancel: () => void;
  onAdded: () => void;
}) {
  const [quarry, setQuarry] = React.useState<CounterpartyValue>(undefined);
  const [location, setLocation] = React.useState<StationValue>({ raw: "", esr: null });
  const [fraction, setFraction] = React.useState("");
  const [tonnage, setTonnage] = React.useState("");
  const [pricePurchase, setPricePurchase] = React.useState("");
  const [priceSale, setPriceSale] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const purchaseN = num(pricePurchase);
  const saleN = num(priceSale);
  const previewMargin = purchaseN !== null && saleN !== null ? saleN - purchaseN : null;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const payload = {
      quarry: quarry,
      locationRaw: location.raw.trim() || undefined,
      locationEsr: location.esr ?? undefined,
      fraction: fraction.trim() || undefined,
      tonnage: tonnage.trim() || undefined,
      pricePurchase: pricePurchase.trim() || undefined,
      priceSale: priceSale.trim() || undefined,
    };

    try {
      const res = await fetch(`/api/deals/${dealId}/stone-lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json: { success: boolean; error?: string } = await res
        .json()
        .catch(() => ({ success: false }));
      if (!res.ok || !json.success) {
        setError(json.error ?? ADD_ERROR);
        setPending(false);
        return;
      }
      onAdded();
    } catch {
      setError(ADD_ERROR);
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-lg border border-border bg-surface-2 p-4"
      noValidate
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <CounterpartyPicker
          label="Карьер"
          role="quarry"
          value={quarry}
          onChange={setQuarry}
          disabled={pending}
        />
        <StationField label="Станция погрузки" value={location} onChange={setLocation} disabled={pending} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <span className="label-caps">Фракция</span>
          <input
            aria-label="Фракция"
            value={fraction}
            disabled={pending}
            onChange={(e) => setFraction(e.target.value)}
            placeholder="5-20"
            className="h-11 w-full rounded-[var(--radius-sm)] border border-border bg-surface-inset px-2.5 text-sm text-text placeholder:text-text-tertiary outline-none focus-visible:border-accent focus-visible:[box-shadow:var(--ring-focus)] md:h-9"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="label-caps">Тонн</span>
          <input
            aria-label="Тонн"
            value={tonnage}
            disabled={pending}
            inputMode="decimal"
            onChange={(e) => setTonnage(e.target.value.replace(/[^\d.,]/g, "").replace(",", "."))}
            placeholder="0"
            className="h-11 w-full rounded-[var(--radius-sm)] border border-border bg-surface-inset px-2.5 text-sm text-text tabular-nums placeholder:text-text-tertiary outline-none focus-visible:border-accent focus-visible:[box-shadow:var(--ring-focus)] md:h-9"
          />
        </div>
        <div className="flex flex-col justify-end gap-1.5">
          <span className="label-caps">Маржа / т</span>
          <div className="flex h-11 items-center md:h-9">
            {previewMargin !== null ? (
              <Money value={previewMargin} sign />
            ) : (
              <span className="text-sm text-text-tertiary">—</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <RateInput
          label="Цена закупки"
          unit="₽ / т"
          value={pricePurchase}
          onChange={setPricePurchase}
          disabled={pending}
        />
        <RateInput
          label="Цена продажи"
          unit="₽ / т"
          value={priceSale}
          onChange={setPriceSale}
          disabled={pending}
        />
      </div>

      {error && <ErrorState message={error} />}

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Добавляем…" : "Добавить"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
          Отмена
        </Button>
      </div>
    </form>
  );
}
