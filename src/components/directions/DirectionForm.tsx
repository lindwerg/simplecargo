"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";

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

export interface DirectionFormInitial {
  displayName: string;
  stationOriginRaw: string;
  stationDestRaw: string;
  cargoName: string;
  wagonCountPlanned: string;
  tonnagePerWagon: string;
  rateModel: "per_wagon_trip" | "lump_sum";
  rateClient: string;
  rateOwner: string;
  clientCounterpartyId: string | null;
  ownerCounterpartyId: string | null;
  paymentTermsRaw: string;
}

interface DirectionFormProps {
  counterparties: CounterpartyOption[];
  initial?: DirectionFormInitial;
  directionId?: string;
  // when set, the new direction is attached to this deal on create and the form
  // redirects back to the deal card (Фаза 1: «Добавить направление» from the deal).
  orderId?: string | undefined;
}

type PartyMode = "none" | "existing" | "new";

const SUBMIT_ERROR = "Не удалось сохранить направление. Проверьте поля и попробуйте снова.";

// A reusable counterparty picker (none / existing / inline-create).
interface PartyPickerProps {
  label: string;
  options: CounterpartyOption[];
  mode: PartyMode;
  setMode: (m: PartyMode) => void;
  selectedId: string;
  setSelectedId: (v: string) => void;
  newName: string;
  setNewName: (v: string) => void;
  newInn: string;
  setNewInn: (v: string) => void;
  disabled: boolean;
  allowNone?: boolean;
  warning?: React.ReactNode;
}

function PartyPicker(props: PartyPickerProps) {
  return (
    <div className="space-y-1.5">
      <span className={labelClass}>{props.label}</span>
      <div className="flex flex-wrap gap-2">
        {props.allowNone && (
          <Button
            type="button"
            size="sm"
            variant={props.mode === "none" ? "secondary" : "ghost"}
            onClick={() => props.setMode("none")}
          >
            Не указан
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant={props.mode === "existing" ? "secondary" : "ghost"}
          onClick={() => props.setMode("existing")}
          disabled={props.options.length === 0}
        >
          Из списка
        </Button>
        <Button
          type="button"
          size="sm"
          variant={props.mode === "new" ? "secondary" : "ghost"}
          onClick={() => props.setMode("new")}
        >
          Новый
        </Button>
      </div>

      {props.mode === "existing" && (
        <select
          aria-label={props.label}
          value={props.selectedId}
          onChange={(e) => props.setSelectedId(e.target.value)}
          disabled={props.disabled}
          className={fieldClass}
        >
          <option value="">— выберите —</option>
          {props.options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}

      {props.mode === "new" && (
        <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
          <input
            aria-label={`${props.label} — название`}
            value={props.newName}
            onChange={(e) => props.setNewName(e.target.value)}
            disabled={props.disabled}
            className={fieldClass}
            placeholder="ООО «Вектор Движения»"
          />
          <input
            aria-label={`${props.label} — ИНН`}
            value={props.newInn}
            onChange={(e) => props.setNewInn(e.target.value)}
            disabled={props.disabled}
            inputMode="numeric"
            className={fieldClass}
            placeholder="ИНН (опц.)"
          />
        </div>
      )}

      {props.warning}
    </div>
  );
}

export function DirectionForm({ counterparties, initial, directionId, orderId }: DirectionFormProps) {
  const router = useRouter();
  const isEdit = Boolean(directionId);

  const [displayName, setDisplayName] = React.useState(initial?.displayName ?? "");
  const [originRaw, setOriginRaw] = React.useState(initial?.stationOriginRaw ?? "");
  const [destRaw, setDestRaw] = React.useState(initial?.stationDestRaw ?? "");
  const [cargoName, setCargoName] = React.useState(initial?.cargoName ?? "");
  const [wagonCount, setWagonCount] = React.useState(initial?.wagonCountPlanned ?? "");
  const [tonnage, setTonnage] = React.useState(initial?.tonnagePerWagon ?? "");
  const [rateModel, setRateModel] = React.useState<"per_wagon_trip" | "lump_sum">(
    initial?.rateModel ?? "per_wagon_trip",
  );
  const [wagonType, setWagonType] = React.useState("Полувагон"); // ПСЦ lookup key only (not persisted)

  // client picker — D16: never auto-selected
  const [clientMode, setClientMode] = React.useState<PartyMode>(
    initial?.clientCounterpartyId ? "existing" : "none",
  );
  const [clientId, setClientId] = React.useState(initial?.clientCounterpartyId ?? "");
  const [clientNewName, setClientNewName] = React.useState("");
  const [clientNewInn, setClientNewInn] = React.useState("");

  // owner picker
  const [ownerMode, setOwnerMode] = React.useState<PartyMode>(
    initial?.ownerCounterpartyId ? "existing" : "none",
  );
  const [ownerId, setOwnerId] = React.useState(initial?.ownerCounterpartyId ?? "");
  const [ownerNewName, setOwnerNewName] = React.useState("");
  const [ownerNewInn, setOwnerNewInn] = React.useState("");

  const [rateClient, setRateClient] = React.useState(initial?.rateClient ?? "");
  const [rateOwner, setRateOwner] = React.useState(initial?.rateOwner ?? "");
  const [ratesConfirmed, setRatesConfirmed] = React.useState(false);
  const [paymentTerms, setPaymentTerms] = React.useState(initial?.paymentTermsRaw ?? "");

  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [assistMsg, setAssistMsg] = React.useState<string | null>(null);

  const clientNum = rateClient ? Number(rateClient) : null;
  const ownerNum = rateOwner ? Number(rateOwner) : null;
  const negativeMargin =
    clientNum !== null && ownerNum !== null && !Number.isNaN(clientNum) && !Number.isNaN(ownerNum)
      ? clientNum <= ownerNum
      : false;

  const partyPayload = (mode: PartyMode, id: string, name: string, inn: string) => {
    if (mode === "existing") return id ? { id } : undefined;
    if (mode === "new") return name.trim() ? { name: name.trim(), inn: inn.trim() || undefined } : undefined;
    return undefined;
  };

  // Pull a snapshot rate from the ПСЦ price-book. Suggestion only (D16) — fills the input,
  // operator still confirms. Requires an EXISTING counterparty + route + wagon type.
  const pullRate = React.useCallback(
    async (side: "owner_cost" | "client_revenue") => {
      setAssistMsg(null);
      const cpId = side === "owner_cost" ? ownerId : clientId;
      const cpMode = side === "owner_cost" ? ownerMode : clientMode;
      if (cpMode !== "existing" || !cpId) {
        setAssistMsg("Выберите контрагента из списка, чтобы подтянуть ставку.");
        return;
      }
      if (!originRaw.trim() || !destRaw.trim() || !wagonType.trim()) {
        setAssistMsg("Заполните маршрут и вид вагона.");
        return;
      }
      try {
        const res = await fetch("/api/directions/resolve-rate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            counterpartyId: cpId,
            side,
            originRaw: originRaw.trim(),
            destRaw: destRaw.trim(),
            wagonType: wagonType.trim(),
          }),
        });
        const json: { success: boolean; data?: { found: boolean; rate?: number } } = await res
          .json()
          .catch(() => ({ success: false }));
        if (!res.ok || !json.success || !json.data?.found || json.data.rate === undefined) {
          setAssistMsg("Ставка в ПСЦ не найдена для этого маршрута.");
          return;
        }
        const value = String(json.data.rate);
        if (side === "owner_cost") setRateOwner(value);
        else setRateClient(value);
        setRatesConfirmed(false); // a pulled value is a suggestion — operator re-confirms
        setAssistMsg("Ставка подтянута из ПСЦ — проверьте и подтвердите.");
      } catch {
        setAssistMsg("Не удалось обратиться к ПСЦ.");
      }
    },
    [ownerId, clientId, ownerMode, clientMode, originRaw, destRaw, wagonType],
  );

  const handleSubmit = React.useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError(null);
      setPending(true);

      const payload = {
        orderId: !isEdit && orderId ? orderId : undefined,
        displayName: displayName.trim() || undefined,
        stationOriginRaw: originRaw.trim(),
        stationDestRaw: destRaw.trim(),
        cargoName: cargoName.trim() || undefined,
        wagonCountPlanned: wagonCount ? Number(wagonCount) : undefined,
        tonnagePerWagon: tonnage ? Number(tonnage) : undefined,
        rateModel,
        client: partyPayload(clientMode, clientId, clientNewName, clientNewInn),
        owner: partyPayload(ownerMode, ownerId, ownerNewName, ownerNewInn),
        rateClient: rateClient ? Number(rateClient) : undefined,
        rateOwner: rateOwner ? Number(rateOwner) : undefined,
        ratesConfirmed,
        paymentTermsRaw: paymentTerms.trim() || undefined,
      };

      try {
        const res = await fetch(isEdit ? `/api/directions/${directionId}` : "/api/directions", {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json: { success: boolean; error?: string } = await res
          .json()
          .catch(() => ({ success: false }));
        if (!res.ok || !json.success) {
          setError(json.error ?? SUBMIT_ERROR);
          setPending(false);
          return;
        }
        router.push(!isEdit && orderId ? `/deals/${orderId}?tab=application` : "/directions");
        router.refresh();
      } catch {
        setError(SUBMIT_ERROR);
        setPending(false);
      }
    },
    [
      orderId,
      displayName,
      originRaw,
      destRaw,
      cargoName,
      wagonCount,
      tonnage,
      rateModel,
      clientMode,
      clientId,
      clientNewName,
      clientNewInn,
      ownerMode,
      ownerId,
      ownerNewName,
      ownerNewInn,
      rateClient,
      rateOwner,
      ratesConfirmed,
      paymentTerms,
      isEdit,
      directionId,
      router,
    ],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-[var(--space-section)]" noValidate>
      {/* ── Маршрут ── */}
      <section className="space-y-5">
        <h2 className="label-caps">Маршрут</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="origin" className={labelClass}>
              Станция отправления
            </label>
            <input
              id="origin"
              value={originRaw}
              onChange={(e) => setOriginRaw(e.target.value)}
              disabled={pending}
              className={fieldClass}
              placeholder="Асбест"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="dest" className={labelClass}>
              Станция назначения
            </label>
            <input
              id="dest"
              value={destRaw}
              onChange={(e) => setDestRaw(e.target.value)}
              disabled={pending}
              className={fieldClass}
              placeholder="Голышманово"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="cargo" className={labelClass}>
              Груз
            </label>
            <input
              id="cargo"
              value={cargoName}
              onChange={(e) => setCargoName(e.target.value)}
              disabled={pending}
              className={fieldClass}
              placeholder="Щебень"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="displayName" className={labelClass}>
              Название (опц.)
            </label>
            <input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={pending}
              className={fieldClass}
              placeholder="Асбест → Голышманово / Июнь"
            />
          </div>
        </div>
      </section>

      {/* ── Объём ── */}
      <section className="space-y-5">
        <h2 className="label-caps">Объём</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label htmlFor="wagonCount" className={labelClass}>
              Вагонов (план)
            </label>
            <input
              id="wagonCount"
              value={wagonCount}
              onChange={(e) => setWagonCount(e.target.value)}
              disabled={pending}
              inputMode="numeric"
              className={`${fieldClass} text-right [font-variant-numeric:tabular-nums]`}
              placeholder="40"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="tonnage" className={labelClass}>
              Тоннаж/вагон
            </label>
            <input
              id="tonnage"
              value={tonnage}
              onChange={(e) => setTonnage(e.target.value)}
              disabled={pending}
              inputMode="decimal"
              className={`${fieldClass} text-right [font-variant-numeric:tabular-nums]`}
              placeholder="68.5"
            />
          </div>
          <div className="space-y-1.5">
            <span className={labelClass}>Модель ставки</span>
            <div className="flex gap-2">
              {(
                [
                  ["per_wagon_trip", "За вагон"],
                  ["lump_sum", "Общая"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={rateModel === value ? "default" : "outline"}
                  onClick={() => setRateModel(value)}
                  disabled={pending}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Стороны ── */}
      <section className="space-y-5">
        <h2 className="label-caps">Стороны</h2>
        <PartyPicker
          label="Клиент"
          options={counterparties}
          mode={clientMode}
          setMode={setClientMode}
          selectedId={clientId}
          setSelectedId={setClientId}
          newName={clientNewName}
          setNewName={setClientNewName}
          newInn={clientNewInn}
          setNewInn={setClientNewInn}
          disabled={pending}
          allowNone
          warning={
            <p className="text-xs text-warn">
              Клиент не заполняется автоматически — подтвердите вручную (D16).
            </p>
          }
        />
        <PartyPicker
          label="Собственник"
          options={counterparties}
          mode={ownerMode}
          setMode={setOwnerMode}
          selectedId={ownerId}
          setSelectedId={setOwnerId}
          newName={ownerNewName}
          setNewName={setOwnerNewName}
          newInn={ownerNewInn}
          setNewInn={setOwnerNewInn}
          disabled={pending}
          allowNone
        />
      </section>

      {/* ── Ставки ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="label-caps">Ставки</h2>
          <div className="flex items-center gap-2">
            <label htmlFor="wagonType" className="text-xs text-text-tertiary">
              Вид вагона (для ПСЦ)
            </label>
            <input
              id="wagonType"
              value={wagonType}
              onChange={(e) => setWagonType(e.target.value)}
              disabled={pending}
              className={`${fieldClass} w-36`}
              placeholder="Полувагон"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="rateClient" className={labelClass}>
              Ставка клиента, ₽/вагон
            </label>
            <div className="flex gap-2">
              <input
                id="rateClient"
                value={rateClient}
                onChange={(e) => setRateClient(e.target.value)}
                disabled={pending}
                inputMode="decimal"
                className={`${fieldClass} text-right [font-variant-numeric:tabular-nums]`}
                placeholder="2800"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => pullRate("client_revenue")}
                disabled={pending}
                aria-label="Подтянуть ставку клиента из ПСЦ"
                title="Подтянуть из ПСЦ"
              >
                <Download aria-hidden />
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="rateOwner" className={labelClass}>
              Ставка собственника, ₽/вагон
            </label>
            <div className="flex gap-2">
              <input
                id="rateOwner"
                value={rateOwner}
                onChange={(e) => setRateOwner(e.target.value)}
                disabled={pending}
                inputMode="decimal"
                className={`${fieldClass} text-right [font-variant-numeric:tabular-nums]`}
                placeholder="1900"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => pullRate("owner_cost")}
                disabled={pending}
                aria-label="Подтянуть ставку собственника из ПСЦ"
                title="Подтянуть из ПСЦ"
              >
                <Download aria-hidden />
              </Button>
            </div>
          </div>
        </div>

        {assistMsg && <p className="text-xs text-text-tertiary">{assistMsg}</p>}

        {negativeMargin && (
          <ErrorState
            variant="page"
            message="Ставка клиента ≤ ставки собственника — отрицательная маржа. Активация будет заблокирована (H1)."
          />
        )}

        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={ratesConfirmed}
            onChange={(e) => setRatesConfirmed(e.target.checked)}
            disabled={pending}
            className="size-4 accent-[var(--color-accent)]"
          />
          Подтверждаю ставки (без подтверждения они не сохранятся как фактические)
        </label>

        <div className="space-y-1.5">
          <label htmlFor="paymentTerms" className={labelClass}>
            Условия оплаты (опц.)
          </label>
          <input
            id="paymentTerms"
            value={paymentTerms}
            onChange={(e) => setPaymentTerms(e.target.value)}
            disabled={pending}
            className={fieldClass}
            placeholder="30 дней"
          />
        </div>
      </section>

      {error && <ErrorState message={error} variant="page" />}

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Сохранение…" : isEdit ? "Сохранить" : "Создать направление"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => router.push("/directions")}
        >
          Отмена
        </Button>
      </div>
    </form>
  );
}
