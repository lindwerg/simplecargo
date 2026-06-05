"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { deriveSide, counterpartyRoleFor, type RnsRole } from "@/lib/pricing/side";

const fieldClass =
  "w-full rounded-md border border-border bg-surface-inset px-3 py-2.5 text-sm text-text " +
  "placeholder:text-text-tertiary outline-none transition-[border-color,box-shadow] " +
  "focus-visible:border-accent focus-visible:[box-shadow:var(--ring-focus)]";

const labelClass = "block text-sm font-medium text-text-secondary";

export interface CounterpartyOption {
  id: string;
  name: string;
}
export interface SupersedeOption {
  id: string;
  label: string;
}
interface PriceProtocolFormProps {
  counterparties: CounterpartyOption[];
  protocols: SupersedeOption[];
}

interface RateRow {
  originRaw: string;
  destRaw: string;
  wagonType: string;
  rate: string;
}

const emptyRow = (): RateRow => ({ originRaw: "", destRaw: "", wagonType: "Полувагон", rate: "" });

const SUBMIT_ERROR = "Не удалось сохранить протокол. Проверьте поля и попробуйте снова.";

export function PriceProtocolForm({ counterparties, protocols }: PriceProtocolFormProps) {
  const router = useRouter();

  const [rnsRole, setRnsRole] = React.useState<RnsRole>("zakazchik");
  const [cpMode, setCpMode] = React.useState<"existing" | "new">(
    counterparties.length > 0 ? "existing" : "new",
  );
  const [counterpartyId, setCounterpartyId] = React.useState(counterparties[0]?.id ?? "");
  const [newName, setNewName] = React.useState("");
  const [newInn, setNewInn] = React.useState("");

  const [protocolNumber, setProtocolNumber] = React.useState("");
  const [contractRef, setContractRef] = React.useState("");
  const [protocolDate, setProtocolDate] = React.useState("");
  const [validFrom, setValidFrom] = React.useState("");
  const [vatIncluded, setVatIncluded] = React.useState(true);
  const [vatRate, setVatRate] = React.useState("22");
  const [supersedesId, setSupersedesId] = React.useState("");

  const [rates, setRates] = React.useState<RateRow[]>([emptyRow(), emptyRow()]);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const side = deriveSide(rnsRole);
  const cpRole = counterpartyRoleFor(side); // "owner" | "client"
  const cpLabel = cpRole === "owner" ? "Собственник (Исполнитель)" : "Клиент (Заказчик у нас)";
  const sideLabel = side === "owner_cost" ? "Затраты (от Поставщика)" : "Выручка (Сумма УА)";

  const updateRate = React.useCallback((index: number, patch: Partial<RateRow>) => {
    setRates((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }, []);
  const addRow = React.useCallback(() => setRates((prev) => [...prev, emptyRow()]), []);
  const removeRow = React.useCallback(
    (index: number) => setRates((prev) => prev.filter((_, i) => i !== index)),
    [],
  );

  const handleSubmit = React.useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError(null);
      setPending(true);

      const counterparty =
        cpMode === "existing"
          ? { id: counterpartyId }
          : { name: newName.trim(), inn: newInn.trim() || undefined };

      const payload = {
        rnsRole,
        counterparty,
        protocolNumber: protocolNumber.trim() || undefined,
        contractRef: contractRef.trim() || undefined,
        protocolDate: protocolDate || undefined,
        validFrom: validFrom || undefined,
        vatInclusive: vatIncluded ? "yes" : "no",
        vatRate: Number(vatRate) || 0,
        supersedesProtocolId: supersedesId || undefined,
        rates: rates.map((r) => ({
          originRaw: r.originRaw.trim(),
          destRaw: r.destRaw.trim(),
          wagonType: r.wagonType.trim(),
          rate: r.rate,
        })),
      };

      try {
        const res = await fetch("/api/price-protocols", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json: { success: boolean; error?: string } = await res.json().catch(() => ({
          success: false,
        }));
        if (!res.ok || !json.success) {
          setError(json.error ?? SUBMIT_ERROR);
          setPending(false);
          return;
        }
        router.push("/directions/pricing");
        router.refresh();
      } catch {
        setError(SUBMIT_ERROR);
        setPending(false);
      }
    },
    [
      cpMode,
      counterpartyId,
      newName,
      newInn,
      rnsRole,
      protocolNumber,
      contractRef,
      protocolDate,
      validFrom,
      vatIncluded,
      vatRate,
      supersedesId,
      rates,
      router,
    ],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-[var(--space-section)]" noValidate>
      {/* ── Стороны ── */}
      <section className="space-y-5">
        <h2 className="label-caps">Стороны</h2>

        <div className="space-y-1.5">
          <span className={labelClass}>РНС выступает</span>
          <div className="flex gap-2">
            {(
              [
                ["zakazchik", "Заказчиком"],
                ["ispolnitel", "Исполнителем"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                variant={rnsRole === value ? "default" : "outline"}
                onClick={() => setRnsRole(value)}
              >
                {label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-text-tertiary">
            Сторона ПСЦ: <span className="text-text-secondary">{sideLabel}</span> · контрагент —{" "}
            <span className="text-text-secondary">{cpLabel}</span>
          </p>
        </div>

        <div className="space-y-1.5">
          <span className={labelClass}>{cpLabel}</span>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={cpMode === "existing" ? "secondary" : "ghost"}
              onClick={() => setCpMode("existing")}
              disabled={counterparties.length === 0}
            >
              Из списка
            </Button>
            <Button
              type="button"
              size="sm"
              variant={cpMode === "new" ? "secondary" : "ghost"}
              onClick={() => setCpMode("new")}
            >
              Новый
            </Button>
          </div>

          {cpMode === "existing" ? (
            <select
              aria-label="Контрагент"
              value={counterpartyId}
              onChange={(e) => setCounterpartyId(e.target.value)}
              disabled={pending}
              className={fieldClass}
            >
              {counterparties.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
              <input
                aria-label="Название контрагента"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                disabled={pending}
                className={fieldClass}
                placeholder="ООО «Вектор Движения»"
              />
              <input
                aria-label="ИНН"
                value={newInn}
                onChange={(e) => setNewInn(e.target.value)}
                disabled={pending}
                inputMode="numeric"
                className={fieldClass}
                placeholder="ИНН (опц.)"
              />
            </div>
          )}
        </div>
      </section>

      {/* ── Протокол ── */}
      <section className="space-y-5">
        <h2 className="label-caps">Протокол</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="protocolNumber" className={labelClass}>
              Номер протокола
            </label>
            <input
              id="protocolNumber"
              value={protocolNumber}
              onChange={(e) => setProtocolNumber(e.target.value)}
              disabled={pending}
              className={fieldClass}
              placeholder="ПРОТОКОЛ № 1"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="contractRef" className={labelClass}>
              Договор (опц.)
            </label>
            <input
              id="contractRef"
              value={contractRef}
              onChange={(e) => setContractRef(e.target.value)}
              disabled={pending}
              className={fieldClass}
              placeholder="ТЭО/04-26/07"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="protocolDate" className={labelClass}>
              Дата протокола
            </label>
            <input
              id="protocolDate"
              type="date"
              value={protocolDate}
              onChange={(e) => setProtocolDate(e.target.value)}
              disabled={pending}
              className={fieldClass}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="validFrom" className={labelClass}>
              Действует с
            </label>
            <input
              id="validFrom"
              type="date"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
              disabled={pending}
              className={fieldClass}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={vatIncluded}
              onChange={(e) => setVatIncluded(e.target.checked)}
              disabled={pending}
              className="size-4 accent-[var(--color-accent)]"
            />
            Ставки включают НДС
          </label>
          <div className="flex items-center gap-2">
            <label htmlFor="vatRate" className="text-sm text-text-secondary">
              Ставка НДС, %
            </label>
            <input
              id="vatRate"
              value={vatRate}
              onChange={(e) => setVatRate(e.target.value)}
              disabled={pending || !vatIncluded}
              inputMode="numeric"
              className={`${fieldClass} w-20`}
            />
          </div>
        </div>

        {protocols.length > 0 && (
          <div className="space-y-1.5">
            <label htmlFor="supersedes" className={labelClass}>
              Заменяет протокол (опц.)
            </label>
            <select
              id="supersedes"
              value={supersedesId}
              onChange={(e) => setSupersedesId(e.target.value)}
              disabled={pending}
              className={fieldClass}
            >
              <option value="">— не заменяет —</option>
              {protocols.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-text-tertiary">
              Выбранный протокол будет помечен «заменён», ставки нового вступят в силу.
            </p>
          </div>
        )}
      </section>

      {/* ── Ставки ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="label-caps">Ставки по маршрутам</h2>
          <Button type="button" variant="ghost" size="sm" onClick={addRow} disabled={pending}>
            <Plus />
            Строка
          </Button>
        </div>

        <div className="space-y-2">
          {rates.map((row, i) => (
            <div
              key={i}
              className="grid items-center gap-2 sm:grid-cols-[1fr_1fr_140px_140px_auto]"
            >
              <input
                aria-label={`Откуда, строка ${i + 1}`}
                value={row.originRaw}
                onChange={(e) => updateRate(i, { originRaw: e.target.value })}
                disabled={pending}
                className={fieldClass}
                placeholder="ДОБРЯТИНО / СВР"
              />
              <input
                aria-label={`Куда, строка ${i + 1}`}
                value={row.destRaw}
                onChange={(e) => updateRate(i, { destRaw: e.target.value })}
                disabled={pending}
                className={fieldClass}
                placeholder="НОГИНСК / ГРК"
              />
              <input
                aria-label={`Вид вагона, строка ${i + 1}`}
                value={row.wagonType}
                onChange={(e) => updateRate(i, { wagonType: e.target.value })}
                disabled={pending}
                className={fieldClass}
                placeholder="Полувагон"
              />
              <input
                aria-label={`Ставка за вагон, строка ${i + 1}`}
                value={row.rate}
                onChange={(e) => updateRate(i, { rate: e.target.value })}
                disabled={pending}
                inputMode="decimal"
                className={`${fieldClass} text-right [font-variant-numeric:tabular-nums]`}
                placeholder="19000"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeRow(i)}
                disabled={pending || rates.length <= 1}
                aria-label={`Удалить строку ${i + 1}`}
                title="Удалить строку"
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          ))}
        </div>
        <p className="text-xs text-text-tertiary">
          ₽ за вагон{vatIncluded ? `, в т.ч. НДС ${vatRate || 0}%` : ", без НДС"}. Маршрут —
          станция или дорога (напр. СВР→ГРК).
        </p>
      </section>

      {error && <ErrorState message={error} variant="page" />}

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Сохранение…" : "Сохранить протокол"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => router.push("/directions/pricing")}
        >
          Отмена
        </Button>
      </div>
    </form>
  );
}
