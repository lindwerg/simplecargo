"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/Money";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  CounterpartyPicker,
  type CounterpartyValue,
} from "@/components/common/CounterpartyPicker";
import { StationField, type StationValue } from "@/components/common/StationField";
import { RateInput } from "@/components/common/RateInput";

import {
  hasStone,
  hasWagons,
  type CargoType,
  type PartyInit,
  type ApiEnvelope,
  type RequestWorksheetProps,
} from "./requestTypes";
import { RequestTariffPanel } from "./RequestTariffPanel";
import { RequestLifecyclePanel } from "./RequestLifecyclePanel";

const SAVE_ERROR = "Не удалось сохранить запрос. Проверьте поля.";

const CARGO_TABS: ReadonlyArray<{ value: CargoType; label: string }> = [
  { value: "stone_only", label: "Щебень" },
  { value: "wagons_only", label: "Вагоны" },
  { value: "stone_with_transport", label: "Щебень + вагоны" },
];

function num(v: string): number | null {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Seed a CounterpartyPicker value from the page's PartyInit (id|name).
function seedParty(p: PartyInit | null): CounterpartyValue {
  if (!p) return undefined;
  if (p.id && p.name) return { id: p.id, name: p.name };
  if (p.name) return { name: p.name };
  return undefined;
}

function seedStation(s: { raw: string; esr: string | null } | null): StationValue {
  return s ? { raw: s.raw, esr: s.esr } : { raw: "", esr: null };
}

// The status badge (sub-status from quoteStatus, overridden by terminal/order states).
function statusBadge(
  status: string,
  quoteStatus: string,
  guNumber: string | null,
): { label: string; cls: string } {
  if (status === "cancelled") {
    return { label: "Архив", cls: "border-border bg-surface-2 text-text-tertiary" };
  }
  if (status === "active") {
    return {
      label: `В исполнении${guNumber ? ` (ГУ ${guNumber})` : ""}`,
      cls: "border-success/30 bg-success-quiet text-success",
    };
  }
  if (status === "confirmed") {
    return { label: "Заявка получена", cls: "border-accent/30 bg-accent-quiet text-accent" };
  }
  if (quoteStatus === "won") {
    return {
      label: "Прошли — ждём заявку",
      cls: "border-success/30 bg-success-quiet text-success",
    };
  }
  if (quoteStatus === "quoted") {
    return { label: "Цена дана", cls: "border-accent/30 bg-accent-quiet text-accent" };
  }
  return { label: "Просчёт", cls: "border-warn/40 bg-warn-quiet text-warn" };
}

// The interactive «Запрос» quoting worksheet. Local state for every field; auto-tariff fires
// only when both ESRs are present and the cargo type involves wagons. «Сохранить» POSTs the
// quote payload, lifecycle actions live in a separate bordered panel — both router.refresh().
export function RequestWorksheet({
  dealId,
  status,
  quoteStatus,
  guNumber,
  clientName,
  initial,
}: RequestWorksheetProps) {
  const router = useRouter();

  const [cargoType, setCargoType] = React.useState<CargoType>(initial.cargoType);
  const [origin, setOrigin] = React.useState<StationValue>(seedStation(initial.origin));
  const [dest, setDest] = React.useState<StationValue>(seedStation(initial.dest));

  const [rateClient, setRateClient] = React.useState(initial.rateClient ?? "");
  const [rateOwner, setRateOwner] = React.useState(initial.rateOwner ?? "");
  const [wagonCount, setWagonCount] = React.useState(
    initial.wagonCount !== null ? String(initial.wagonCount) : "",
  );

  const [priceSale, setPriceSale] = React.useState(initial.priceSale ?? "");
  const [pricePurchase, setPricePurchase] = React.useState(initial.pricePurchase ?? "");
  const [tonnage, setTonnage] = React.useState(initial.tonnage ?? "");
  const [fraction, setFraction] = React.useState(initial.fraction ?? "");

  const [client, setClient] = React.useState<CounterpartyValue>(() => seedParty(initial.client));
  const [owner, setOwner] = React.useState<CounterpartyValue>(() => seedParty(initial.owner));
  const [quarry, setQuarry] = React.useState<CounterpartyValue>(() => seedParty(initial.quarry));

  const [provision, setProvision] = React.useState<number | null>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const wagons = hasWagons(cargoType);
  const stone = hasStone(cargoType);
  const badge = statusBadge(status, quoteStatus, guNumber);

  const saleN = num(priceSale);
  const purchaseN = num(pricePurchase);
  const stoneMargin = saleN !== null && purchaseN !== null ? saleN - purchaseN : null;

  const showTariff = wagons && Boolean(origin.esr) && Boolean(dest.esr);

  async function save() {
    setError(null);
    setPending(true);

    const payload = {
      cargoType,
      cargoName: null,
      origin: wagons ? { raw: origin.raw.trim(), esr: origin.esr } : null,
      dest: wagons ? { raw: dest.raw.trim(), esr: dest.esr } : null,
      // stone_only uses the single «Станция погрузки» field, surfaced as origin.
      ...(stone && !wagons ? { origin: { raw: origin.raw.trim(), esr: origin.esr } } : {}),
      client: client ?? null,
      owner: wagons ? (owner ?? null) : null,
      quarry: stone ? (quarry ?? null) : null,
      rateClient: rateClient.trim() || null,
      rateOwner: rateOwner.trim() || null,
      wagonCount: num(wagonCount),
      priceSale: priceSale.trim() || null,
      pricePurchase: pricePurchase.trim() || null,
      tonnage: tonnage.trim() || null,
      fraction: fraction.trim() || null,
    };

    try {
      const res = await fetch(`/api/deals/${dealId}/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json: ApiEnvelope<unknown> = await res
        .json()
        .catch(() => ({ success: false }) as ApiEnvelope<unknown>);
      if (!res.ok || !json.success) {
        setError(json.error ?? SAVE_ERROR);
        setPending(false);
        return;
      }
      setPending(false);
      router.refresh();
    } catch {
      setError(SAVE_ERROR);
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* 1. Шапка */}
      <header className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center rounded-pill border px-2.5 py-1 text-2xs font-medium",
            badge.cls,
          )}
        >
          {badge.label}
        </span>
        {clientName && <span className="text-sm text-text-secondary">{clientName}</span>}
      </header>

      {/* 2. Тип груза */}
      <div
        role="tablist"
        aria-label="Тип груза"
        className="inline-flex w-full overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface-1 p-1"
      >
        {CARGO_TABS.map((t) => {
          const selected = cargoType === t.value;
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={selected}
              disabled={pending}
              onClick={() => setCargoType(t.value)}
              className={cn(
                "flex-1 rounded-[var(--radius-sm)] px-2 py-2 text-2xs font-medium transition-colors",
                "focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]",
                selected
                  ? "bg-accent text-text-inverse"
                  : "text-text-secondary hover:text-text",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 3. Маршрут */}
      {wagons ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <StationField label="Откуда" value={origin} onChange={setOrigin} disabled={pending} />
          <StationField label="Куда" value={dest} onChange={setDest} disabled={pending} />
        </div>
      ) : (
        <StationField
          label="Станция погрузки"
          value={origin}
          onChange={setOrigin}
          disabled={pending}
        />
      )}

      {/* 4. Авто-тариф */}
      {showTariff && origin.esr && dest.esr && (
        <RequestTariffPanel
          originEsr={origin.esr}
          destEsr={dest.esr}
          onApplyClientRate={setRateClient}
          onProvision={setProvision}
        />
      )}

      {/* 5. Цены */}
      {wagons && (
        <section className="space-y-4 rounded-[var(--radius-lg)] border border-border bg-surface-1 p-4">
          <h3 className="label-caps">Ставки за вагоны</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <RateInput
              label="Ставка клиенту"
              unit="₽ / ваг"
              value={rateClient}
              onChange={setRateClient}
              disabled={pending}
            />
            <RateInput
              label="Наша ставка / собственник"
              unit="₽ / ваг"
              value={rateOwner}
              onChange={setRateOwner}
              suggested={provision}
              disabled={pending}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:max-w-[12rem]">
            <span className="label-caps">Вагонов</span>
            <input
              aria-label="Вагонов"
              className="h-11 w-full rounded-[var(--radius-sm)] border border-border bg-surface-inset px-2.5 text-sm text-text tabular-nums placeholder:text-text-tertiary outline-none focus-visible:border-accent focus-visible:[box-shadow:var(--ring-focus)] md:h-9"
              value={wagonCount}
              disabled={pending}
              inputMode="numeric"
              placeholder="0"
              onChange={(e) => setWagonCount(e.target.value.replace(/\D/g, ""))}
            />
          </div>
        </section>
      )}

      {stone && (
        <section className="space-y-4 rounded-[var(--radius-lg)] border border-border bg-surface-1 p-4">
          <h3 className="label-caps">Цены на щебень</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <RateInput
              label="Цена продажи"
              unit="₽ / т"
              value={priceSale}
              onChange={setPriceSale}
              disabled={pending}
            />
            <RateInput
              label="Цена закупки"
              unit="₽ / т"
              value={pricePurchase}
              onChange={setPricePurchase}
              disabled={pending}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <span className="label-caps">Фракция</span>
              <input
                aria-label="Фракция"
                className="h-11 w-full rounded-[var(--radius-sm)] border border-border bg-surface-inset px-2.5 text-sm text-text placeholder:text-text-tertiary outline-none focus-visible:border-accent focus-visible:[box-shadow:var(--ring-focus)] md:h-9"
                value={fraction}
                disabled={pending}
                placeholder="5-20"
                onChange={(e) => setFraction(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="label-caps">Тонн</span>
              <input
                aria-label="Тонн"
                className="h-11 w-full rounded-[var(--radius-sm)] border border-border bg-surface-inset px-2.5 text-sm text-text tabular-nums placeholder:text-text-tertiary outline-none focus-visible:border-accent focus-visible:[box-shadow:var(--ring-focus)] md:h-9"
                value={tonnage}
                disabled={pending}
                inputMode="decimal"
                placeholder="0"
                onChange={(e) =>
                  setTonnage(e.target.value.replace(/[^\d.,]/g, "").replace(",", "."))
                }
              />
            </div>
            <div className="flex flex-col justify-end gap-1.5">
              <span className="label-caps">Маржа / т</span>
              <div className="flex h-11 items-center md:h-9">
                {stoneMargin !== null ? (
                  <Money value={stoneMargin} sign />
                ) : (
                  <span className="text-sm text-text-tertiary">—</span>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 6. Контрагенты */}
      <section className="space-y-4 rounded-[var(--radius-lg)] border border-border bg-surface-1 p-4">
        <h3 className="label-caps">Контрагенты</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <CounterpartyPicker
            label="Клиент"
            role="client"
            value={client}
            onChange={setClient}
            disabled={pending}
          />
          {wagons && (
            <CounterpartyPicker
              label="Собственник вагонов"
              role="owner"
              value={owner}
              onChange={setOwner}
              disabled={pending}
            />
          )}
          {stone && (
            <CounterpartyPicker
              label="Карьер"
              role="quarry"
              value={quarry}
              onChange={setQuarry}
              disabled={pending}
            />
          )}
        </div>
      </section>

      {error && <ErrorState message={error} />}

      {/* 7. Сохранить */}
      <Button onClick={save} disabled={pending} className="w-full sm:w-auto">
        <Save />
        {pending ? "Сохраняем…" : "Сохранить запрос"}
      </Button>

      {/* 8. Лайфцикл */}
      <RequestLifecyclePanel dealId={dealId} status={status} />
    </div>
  );
}
