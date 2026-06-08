"use client";

import * as React from "react";
import { Plus, Trash2, Calculator, Loader2, AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";
import { StationField, type StationValue } from "@/components/common/StationField";

// Common нерудные ЕТСНГ positions (all class 1) — the SimpleCargo core cargo set.
const ETSNG_PRESETS: ReadonlyArray<{ code: string; label: string }> = [
  { code: "232431", label: "Щебень (не поименованный) — 232431" },
  { code: "232395", label: "Щебень гранитный — 232395" },
  { code: "232408", label: "Щебень из гравия — 232408" },
  { code: "232087", label: "Гравий — 232087" },
  { code: "231000", label: "Песок / земля / глина — 231000" },
  { code: "281000", label: "Цемент — 281000" },
];

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
        <p className="label-caps">Маршрут</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <StationField label="Откуда" value={origin} onChange={setOrigin} />
          <StationField label="Куда" value={dest} onChange={setDest} />
        </div>

        <p className="label-caps mt-5">Груз</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-2xs text-text-tertiary">Номенклатура (ЕТСНГ)</span>
            <select
              className={fieldClass}
              value={ETSNG_PRESETS.some((p) => p.code === etsng) ? etsng : "custom"}
              onChange={(e) => {
                if (e.target.value !== "custom") setEtsng(e.target.value);
              }}
            >
              {ETSNG_PRESETS.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.label}
                </option>
              ))}
              <option value="custom">Другой код…</option>
            </select>
          </label>
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
        </div>

        <p className="label-caps mt-5">Вагоны</p>
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
                      {r.k4}
                      {r.k4Fitted ? "*" : ""}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-text">{rub(r.tariffRub)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="space-y-1 rounded-[var(--radius-sm)] border border-border/60 bg-surface-2 p-3">
            <Row label={`Провозная плата (${result.wagonCount} ваг., без НДС)`} value={rub(result.totalNoVat)} />
            <Row label={`НДС ${result.vatRate}%`} value={rub(result.totalWithVat! - result.totalNoVat)} />
            <div className="mt-1 flex items-baseline justify-between border-t border-border/60 pt-2">
              <span className="text-sm font-medium text-text">Итого с НДС</span>
              <span className="num text-xl font-semibold tabular-nums text-accent">
                {rub(result.totalWithVat!)}
              </span>
            </div>
          </div>
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
