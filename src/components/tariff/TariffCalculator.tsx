"use client";

import * as React from "react";
import { Plus, Trash2, Calculator, Loader2, AlertTriangle, ArrowLeftRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { StationField, type StationValue } from "@/components/common/StationField";

// Common нерудные ЕТСНГ positions (all class 1) — the SimpleCargo core cargo set.
const ETSNG_PRESETS: ReadonlyArray<{ code: string; label: string; short: string }> = [
  { code: "232431", label: "Щебень (не поименованный) — 232431", short: "Щебень" },
  { code: "232395", label: "Щебень гранитный — 232395", short: "Гранитный" },
  { code: "232408", label: "Щебень из гравия — 232408", short: "Из гравия" },
  { code: "232087", label: "Гравий — 232087", short: "Гравий" },
  { code: "231000", label: "Песок / земля / глина — 231000", short: "Песок" },
  { code: "281000", label: "Цемент — 281000", short: "Цемент" },
];

// Быстрые конфигурации отправки: одно касание — готовый состав групп.
const WAGON_PRESETS: ReadonlyArray<{ label: string; groups: WagonGroup[] }> = [
  { label: "1×70", groups: [{ capacityT: "70", count: "1", innovative: false }] },
  { label: "6×70", groups: [{ capacityT: "70", count: "6", innovative: false }] },
  { label: "20×70", groups: [{ capacityT: "70", count: "20", innovative: false }] },
  { label: "6×75 ⚡", groups: [{ capacityT: "75", count: "6", innovative: true }] },
  { label: "20×75 ⚡", groups: [{ capacityT: "75", count: "20", innovative: true }] },
];

// Быстрые коэффициенты собственника для ставки предоставления (+% к инвентарному И+В).
const COEFF_PRESETS: ReadonlyArray<{ label: string; value: string }> = [
  { label: "+10%", value: "1.1" },
  { label: "+15%", value: "1.15" },
  { label: "+20%", value: "1.2" },
];

const chipClass =
  "inline-flex h-8 items-center rounded-pill border px-3 text-2xs font-medium transition-colors " +
  "focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]";

function chipState(active: boolean): string {
  return active
    ? "border-accent bg-accent-quiet text-accent"
    : "border-border text-text-secondary hover:text-text";
}

interface WagonGroup {
  capacityT: string;
  count: string;
  innovative: boolean;
}

interface PerWagon {
  capacityT: number;
  innovative: boolean;
  n8: number;
  k1: number;
  k4: number;
  k4Fitted: boolean;
  tariffRub: number;
}

interface QuoteProvision {
  ownerCoeff: number;
  perGroup: ReadonlyArray<{
    capacityT: number;
    count: number;
    inventoryNoVat: number;
    provisionNoVat: number;
  }>;
  inventoryTotalNoVat: number;
  provisionTotalNoVat: number;
  provisionTotalWithVat: number;
}

interface QuoteResult {
  scope: "supported" | "out-of-scope";
  confidence: "green" | "yellow" | "red";
  distanceKm: number | null;
  distanceConfidence: "green" | "yellow" | "red";
  distanceLegs: ReadonlyArray<{ kind: string; km: number }>;
  tariffClass: 1 | 2 | 3 | null;
  etsngName: string | null;
  perWagon: PerWagon[];
  wagonCount: number;
  totalNoVat: number | null;
  vatRate: number;
  totalWithVat: number | null;
  provision: QuoteProvision | null;
  provisionRedReason: string | null;
  warnings: string[];
}

const rub = (n: number): string => `${Math.round(n).toLocaleString("ru-RU")} ₽`;

const LEG_RU: Record<string, string> = {
  "spur-origin": "Подвоз к ТП (отправление)",
  backbone: "ТП ↔ ТП (Книга 3)",
  "spur-dest": "Подвоз от ТП (назначение)",
  "hub-adder": "Узловая надбавка",
  special: "Особое расстояние",
  direct: "Прямое ребро",
};

const fieldClass =
  "h-11 w-full rounded-[var(--radius-sm)] border border-border bg-surface-inset px-2.5 text-sm text-text " +
  "placeholder:text-text-tertiary focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] md:h-9";

const CONF_LABEL: Record<string, { ru: string; cls: string }> = {
  green: { ru: "Достоверно (до рубля)", cls: "bg-success-quiet text-success" },
  yellow: { ru: "Проверьте", cls: "bg-accent-quiet text-accent" },
  red: { ru: "Вручную", cls: "bg-danger-quiet text-danger" },
};

export function TariffCalculator() {
  const [origin, setOrigin] = React.useState<StationValue>({ raw: "", esr: null });
  const [dest, setDest] = React.useState<StationValue>({ raw: "", esr: null });
  const [etsng, setEtsng] = React.useState<string>(ETSNG_PRESETS[0].code);
  const [ownership, setOwnership] = React.useState<"own" | "rzd">("own");
  const [wagonType, setWagonType] = React.useState<string>("полувагон");
  const [groups, setGroups] = React.useState<WagonGroup[]>([
    { capacityT: "70", count: "1", innovative: false },
  ]);
  // Коэффициент собственника для отдельного блока «Предоставление» (× к инвентарному И+В).
  const [ownerCoeff, setOwnerCoeff] = React.useState<string>("1.15");
  // Предоставление — опционально (галочка): выключено → блок не считается и не показывается.
  const [withProvision, setWithProvision] = React.useState<boolean>(true);

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<QuoteResult | null>(null);

  const canSubmit = Boolean(origin.esr && dest.esr) && groups.length > 0 && !loading;

  function updateGroup(i: number, patch: Partial<WagonGroup>) {
    setGroups((g) => g.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function addGroup() {
    setGroups((g) => [...g, { capacityT: "75", count: "1", innovative: true }]);
  }
  function removeGroup(i: number) {
    setGroups((g) => (g.length > 1 ? g.filter((_, idx) => idx !== i) : g));
  }
  function swapStations() {
    setOrigin(dest);
    setDest(origin);
  }
  function applyWagonPreset(preset: { groups: WagonGroup[] }) {
    setGroups(preset.groups.map((g) => ({ ...g })));
  }
  /** Активен ли пресет (для подсветки чипа): один-в-один совпадение состава групп. */
  function presetActive(preset: { groups: WagonGroup[] }): boolean {
    return (
      groups.length === preset.groups.length &&
      groups.every(
        (g, i) =>
          g.capacityT === preset.groups[i].capacityT &&
          g.count === preset.groups[i].count &&
          g.innovative === preset.groups[i].innovative,
      )
    );
  }

  async function submit() {
    if (!origin.esr || !dest.esr) {
      setError("Подтвердите станции отправления и назначения (выберите из подсказок).");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/tariff/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originEsr: origin.esr,
          destEsr: dest.esr,
          etsngCode: etsng.trim(),
          ownership,
          wagonType: wagonType.trim(),
          wagons: groups.map((g) => ({
            capacityT: Number(g.capacityT),
            count: Number(g.count),
            innovative: g.innovative,
          })),
          ...(withProvision && Number(ownerCoeff) > 0 ? { ownerCoeff: Number(ownerCoeff) } : {}),
        }),
      });
      const json = await res.json();
      if (!json?.success) {
        setError(json?.error ?? "Ошибка расчёта");
        return;
      }
      setResult(json.data as QuoteResult);
    } catch {
      setError("Сеть недоступна — попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* ── Ввод ─────────────────────────────────────────────────────────────── */}
      <section className="rounded-[var(--radius-lg)] border border-border bg-surface-1 p-4 md:p-5">
        <div className="flex items-center justify-between">
          <p className="label-caps">Маршрут</p>
          <button
            type="button"
            onClick={swapStations}
            className="inline-flex items-center gap-1.5 text-2xs text-text-tertiary transition-colors hover:text-text focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
          >
            <ArrowLeftRight className="size-3.5" aria-hidden /> поменять местами
          </button>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <StationField label="Откуда" value={origin} onChange={setOrigin} />
          <StationField label="Куда" value={dest} onChange={setDest} />
        </div>

        <p className="label-caps mt-5">Груз</p>
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Быстрый выбор груза">
          {ETSNG_PRESETS.map((p) => (
            <button
              key={p.code}
              type="button"
              title={p.label}
              onClick={() => setEtsng(p.code)}
              className={cn(chipClass, chipState(etsng === p.code))}
            >
              {p.short}
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-2xs text-text-tertiary">Код ЕТСНГ</span>
            <input
              className={cn(fieldClass, "tabular-nums")}
              value={etsng}
              inputMode="numeric"
              onChange={(e) => setEtsng(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="232431"
            />
          </label>
          <div className="flex flex-col justify-end gap-1.5 pb-2.5 text-2xs text-text-tertiary">
            {ETSNG_PRESETS.find((p) => p.code === etsng)?.label ?? "Произвольный код ЕТСНГ"}
          </div>
        </div>

        <p className="label-caps mt-5">Вагоны</p>
        <div
          className="mt-3 flex flex-wrap gap-1.5"
          role="group"
          aria-label="Быстрые конфигурации отправки"
        >
          {WAGON_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => applyWagonPreset(p)}
              className={cn(chipClass, "tabular-nums", chipState(presetActive(p)))}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-2xs text-text-tertiary">Собственность</span>
            <select
              className={fieldClass}
              value={ownership}
              onChange={(e) => setOwnership(e.target.value as "own" | "rzd")}
            >
              <option value="own">Собственный / арендованный</option>
              <option value="rzd">Парк РЖД (общий)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-2xs text-text-tertiary">Тип вагона</span>
            <select
              className={fieldClass}
              value={wagonType}
              onChange={(e) => setWagonType(e.target.value)}
            >
              <option value="полувагон">Полувагон</option>
              <option value="крытый">Крытый</option>
              <option value="платформа">Платформа</option>
              <option value="цистерна">Цистерна</option>
            </select>
          </label>
        </div>

        <div className="mt-3 space-y-2">
          {groups.map((g, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_1fr_auto_auto] items-end gap-2 rounded-[var(--radius-sm)] border border-border/60 bg-surface-2 p-2"
            >
              <label className="flex flex-col gap-1">
                <span className="text-2xs text-text-tertiary">Г/п, т</span>
                <input
                  className={cn(fieldClass, "tabular-nums")}
                  value={g.capacityT}
                  inputMode="decimal"
                  onChange={(e) => updateGroup(i, { capacityT: e.target.value.replace(/[^\d.]/g, "") })}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-2xs text-text-tertiary">Кол-во</span>
                <input
                  className={cn(fieldClass, "tabular-nums")}
                  value={g.count}
                  inputMode="numeric"
                  onChange={(e) => updateGroup(i, { count: e.target.value.replace(/\D/g, "") })}
                />
              </label>
              <label className="flex h-11 items-center gap-1.5 px-1 md:h-9">
                <input
                  type="checkbox"
                  checked={g.innovative}
                  onChange={(e) => updateGroup(i, { innovative: e.target.checked })}
                  className="size-4 accent-[var(--color-accent)]"
                />
                <span className="text-2xs text-text-secondary">иннов.</span>
              </label>
              <button
                type="button"
                onClick={() => removeGroup(i)}
                disabled={groups.length <= 1}
                aria-label="Удалить группу"
                className="grid size-9 place-items-center rounded-[var(--radius-sm)] text-text-tertiary hover:text-danger disabled:opacity-30"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addGroup}
            className="inline-flex items-center gap-1.5 text-2xs text-accent hover:underline"
          >
            <Plus className="size-3.5" aria-hidden /> добавить группу вагонов
          </button>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="label-caps">Предоставление</p>
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={withProvision}
              onChange={(e) => setWithProvision(e.target.checked)}
              className="size-4 accent-[var(--color-accent)]"
            />
            <span className="text-2xs text-text-secondary">считать предоставление</span>
          </label>
        </div>
        {withProvision && (
          <>
            <p className="mt-1 text-2xs text-text-tertiary">
              Ставка предоставления = инвентарный тариф И+В × коэффициент собственника. Считается
              отдельным блоком, к провозной плате не прибавляется.
            </p>
            <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-2xs text-text-tertiary">Коэфф. собственника ×</span>
                <input
                  className={cn(fieldClass, "tabular-nums")}
                  value={ownerCoeff}
                  inputMode="decimal"
                  onChange={(e) => setOwnerCoeff(e.target.value.replace(/[^\d.]/g, ""))}
                  placeholder="1.15"
                />
              </label>
              <div className="flex gap-1.5 pb-0.5" role="group" aria-label="Быстрый коэффициент">
                {COEFF_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setOwnerCoeff(p.value)}
                    className={cn(chipClass, "tabular-nums", chipState(ownerCoeff === p.value))}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className={cn(
            "mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-md)] px-4 text-sm font-medium",
            "bg-accent text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-40 md:h-10",
            "focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]",
          )}
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Calculator className="size-4" aria-hidden />
          )}
          Рассчитать провозную плату
        </button>
        {error && (
          <p className="mt-2 flex items-center gap-1.5 text-2xs text-danger">
            <AlertTriangle className="size-3.5 shrink-0" aria-hidden /> {error}
          </p>
        )}
      </section>

      {/* ── Результат ────────────────────────────────────────────────────────── */}
      <section className="rounded-[var(--radius-lg)] border border-border bg-surface-1 p-4 md:p-5">
        {!result ? (
          <div className="flex h-full min-h-[16rem] flex-col items-center justify-center gap-2 text-center text-text-tertiary">
            <Calculator className="size-7 opacity-40" aria-hidden />
            <p className="text-sm">Заполните маршрут и вагоны — здесь появится расчёт РЖД-тарифа.</p>
            <p className="text-2xs">Точно до рубля: собственный полувагон, класс 1 (нерудные).</p>
          </div>
        ) : (
          <Result result={result} />
        )}
      </section>
    </div>
  );
}

function Result({ result }: { result: QuoteResult }) {
  const conf = CONF_LABEL[result.confidence];
  // Все главные цифры — ЗА ВАГОН; суммы по отправке только пояснительной строкой.
  const withVat = (n: number): number => Math.round(n * (1 + result.vatRate / 100));
  const grouped = collapse(result.perWagon);
  const singleGroup = grouped.length === 1;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="label-caps">Результат</p>
        <span className={cn("rounded-pill px-2 py-0.5 text-2xs font-medium", conf.cls)}>
          {conf.ru}
        </span>
      </div>

      {/* Distance */}
      <div className="rounded-[var(--radius-sm)] border border-border/60 bg-surface-2 p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-2xs text-text-tertiary">Тарифное расстояние</span>
          <span className="num text-lg font-semibold tabular-nums text-text">
            {result.distanceKm !== null ? `${result.distanceKm.toLocaleString("ru-RU")} км` : "—"}
          </span>
        </div>
        {result.distanceLegs.length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {result.distanceLegs.map((l, i) => (
              <li key={i} className="flex justify-between text-2xs text-text-secondary">
                <span>{LEG_RU[l.kind] ?? l.kind}</span>
                <span className="tabular-nums">{l.km.toLocaleString("ru-RU")} км</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {result.scope === "supported" && result.totalNoVat !== null ? (
        <>
          {/* Per-wagon */}
          <div className="overflow-hidden rounded-[var(--radius-sm)] border border-border/60">
            <table className="w-full text-2xs">
              <thead className="bg-surface-2 text-text-tertiary">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Г/п</th>
                  <th className="px-2 py-1.5 text-right font-medium">N8</th>
                  <th className="px-2 py-1.5 text-right font-medium">K1</th>
                  <th className="px-2 py-1.5 text-right font-medium">K4</th>
                  <th className="px-2 py-1.5 text-right font-medium">₽/ваг</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {collapse(result.perWagon).map((r, i) => (
                  <tr key={i} className="text-text-secondary">
                    <td className="px-2 py-1.5 tabular-nums">
                      {r.capacityT}
                      {r.innovative ? " ⚡" : ""}
                      {r.count > 1 ? ` ×${r.count}` : ""}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.n8.toLocaleString("ru-RU")}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.k1}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {Number.isInteger(r.k4) ? r.k4 : r.k4.toFixed(3)}
                      {r.k4Fitted ? "*" : ""}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-text">{rub(r.tariffRub)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Провозная плата — ЗА ВАГОН (суммы по отправке только справочной строкой) */}
          <div className="space-y-1 rounded-[var(--radius-sm)] border border-border/60 bg-surface-2 p-3">
            <p className="label-caps mb-2">Провозная плата · за вагон</p>
            {grouped.map((g, i) => (
              <React.Fragment key={i}>
                <Row
                  label={`Тариф за вагон ${g.capacityT} т${g.innovative ? " ⚡" : ""} (без НДС)`}
                  value={rub(g.tariffRub)}
                />
                <Row
                  label={`НДС ${result.vatRate}%`}
                  value={rub(withVat(g.tariffRub) - g.tariffRub)}
                />
                {!singleGroup && (
                  <Row
                    label={`За вагон ${g.capacityT} т с НДС`}
                    value={rub(withVat(g.tariffRub))}
                  />
                )}
              </React.Fragment>
            ))}
            {singleGroup && (
              <div className="mt-1 flex items-baseline justify-between border-t border-border/60 pt-2">
                <span className="text-sm font-medium text-text">За вагон с НДС</span>
                <span className="num text-xl font-semibold tabular-nums text-accent">
                  {rub(withVat(grouped[0].tariffRub))}
                </span>
              </div>
            )}
            {result.wagonCount > 1 && (
              <p className="mt-1 text-2xs text-text-tertiary">
                Вся отправка ({result.wagonCount} ваг.): {rub(result.totalNoVat)} без НДС ·{" "}
                {rub(result.totalWithVat!)} с НДС
              </p>
            )}
          </div>

          {/* Предоставление — отдельный блок (инвентарный И+В × коэффициент собственника) */}
          {result.provision && (
            <div className="space-y-1 rounded-[var(--radius-sm)] border border-border/60 bg-surface-2 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="label-caps">Предоставление</p>
                <span className="rounded-pill bg-accent-quiet px-2 py-0.5 text-2xs font-medium text-accent">
                  проверяется
                </span>
              </div>
              {result.provision.perGroup.map((g, i) => (
                <React.Fragment key={i}>
                  <Row
                    label={`Инвентарный И+В за вагон ${g.capacityT} т`}
                    value={rub(g.inventoryNoVat)}
                  />
                  {result.provision!.perGroup.length > 1 && (
                    <Row
                      label={`Предоставление за вагон ${g.capacityT} т (без НДС)`}
                      value={rub(g.provisionNoVat)}
                    />
                  )}
                </React.Fragment>
              ))}
              {result.provision.perGroup.length === 1 && (
                <>
                  <div className="mt-1 flex items-baseline justify-between border-t border-border/60 pt-2">
                    <span className="text-sm font-medium text-text">
                      Предоставление ×{result.provision.ownerCoeff} за вагон (без НДС)
                    </span>
                    <span className="num text-xl font-semibold tabular-nums text-accent">
                      {rub(result.provision.perGroup[0].provisionNoVat)}
                    </span>
                  </div>
                  <Row
                    label={`За вагон с НДС ${result.vatRate}%`}
                    value={rub(withVat(result.provision.perGroup[0].provisionNoVat))}
                  />
                </>
              )}
              {result.wagonCount > 1 && (
                <p className="mt-1 text-2xs text-text-tertiary">
                  Вся отправка ({result.wagonCount} ваг.): {rub(result.provision.provisionTotalNoVat)}{" "}
                  без НДС · {rub(result.provision.provisionTotalWithVat)} с НДС
                </p>
              )}
            </div>
          )}
          {result.provisionRedReason && (
            <div className="rounded-[var(--radius-sm)] border border-danger/30 bg-surface-2 p-3 text-2xs text-text-secondary">
              <span className="font-medium text-danger">Предоставление не выдано:</span>{" "}
              {result.provisionRedReason}
            </div>
          )}
        </>
      ) : (
        <div className="rounded-[var(--radius-sm)] border border-accent/30 bg-accent-quiet p-3 text-2xs text-text-secondary">
          <p className="font-medium text-accent">Цена не рассчитана автоматически</p>
          <p className="mt-1">Параметры вне валидированного до-рубля контура — занесите ставку вручную.</p>
        </div>
      )}

      {result.etsngName && (
        <p className="text-2xs text-text-tertiary">
          Груз: {result.etsngName} · класс {result.tariffClass ?? "—"}
        </p>
      )}

      {result.warnings.length > 0 && (
        <ul className="space-y-1">
          {result.warnings.map((w, i) => (
            <li key={i} className="flex gap-1.5 text-2xs text-text-tertiary">
              <span aria-hidden>·</span>
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between text-2xs">
      <span className="text-text-tertiary">{label}</span>
      <span className="tabular-nums text-text-secondary">{value}</span>
    </div>
  );
}

// Collapse identical per-wagon rows (same capacity/innovative/tariff) into one with a count.
function collapse(
  wagons: PerWagon[],
): Array<PerWagon & { count: number }> {
  const map = new Map<string, PerWagon & { count: number }>();
  for (const w of wagons) {
    const key = `${w.capacityT}|${w.innovative}|${w.tariffRub}`;
    const ex = map.get(key);
    if (ex) ex.count += 1;
    else map.set(key, { ...w, count: 1 });
  }
  return [...map.values()];
}
