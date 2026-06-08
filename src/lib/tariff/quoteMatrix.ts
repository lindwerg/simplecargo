// Матрица «обычный/инновационный × группы отправки» для голосового быстрого расчёта.
//
// Цена за вагон зависит от типа вагона (обычный / инновационный 75т ×0,9595) И от размера
// отправки (K4 отправочный, Табл.5 ТР-1 2026): 1 вагон — одна цена, 6–20 — другая, и т.д.
// Эта матрица считает все 5 групп ТР-1 × оба типа вагона за один маршрут, плюс «ставку
// предоставления» = тариф + наценка% (модель tariff_plus_markup, см. resolveAmount).
//
// buildMatrixCells — ЧИСТАЯ (готовый distKm на входе, без БД/графа) → тестируется golden-ами,
// как goldenRtariff.test.ts. computeQuoteMatrix — async-обёртка: расстояние (ТР-4) + класс ЕТСНГ
// + scope-guard + чистый расчёт. Вне контура (own ПВ, класс 1, домашнее) цену НЕ выдаёт.

import { resolveDistance } from "@/lib/distance/repository";
import { isForeignEsr } from "@/lib/distance/foreignStations";
import { resolveAmount } from "@/lib/pricing/rate-expression";
import {
  computeWagonN8,
  k4GroupForWagons,
  type N8TariffData,
} from "@/lib/tariff/computeTariffN8";
import { loadN8TariffData } from "@/lib/tariff/n8Data";
import { lookupEtsng, VAT_RATE_DOMESTIC } from "@/lib/tariff/quoteService";

/** Груз по умолчанию, если в голосовой фразе/запросе не назван: щебень (класс 1, нерудные). */
export const DEFAULT_ETSNG_CODE = "232431";
/** Дефолтная грузоподъёмность обычного полувагона, т (оператор может переопределить). */
export const DEFAULT_CLASSIC_CAPACITY_T = 70;
/** Дефолтная грузоподъёмность инновационного полувагона, т. */
export const DEFAULT_INNOVATIVE_CAPACITY_T = 75;
/** Наценка предоставления по умолчанию, % к тарифу. */
export const DEFAULT_MARKUP_PCT = 15;

/**
 * Группы отправки ТР-1 (Табл.5) и их представительное число вагонов, чтобы k4GroupForWagons
 * вернул нужную строку: 1→"1", 2→"2", 4→"3-5", 6→"6-20", 25→"свыше 20".
 */
const BANDS: ReadonlyArray<{ band: string; representativeCount: number; label: string }> = [
  { band: "1", representativeCount: 1, label: "Повагонная (1 ваг)" },
  { band: "2", representativeCount: 2, label: "Группа (2 ваг)" },
  { band: "3-5", representativeCount: 4, label: "Группа (3–5 ваг)" },
  { band: "6-20", representativeCount: 6, label: "Группа (6–20 ваг)" },
  { band: "свыше 20", representativeCount: 25, label: "Маршрут (свыше 20)" },
];

export interface MatrixCell {
  /** Провозная плата РЖД за вагон, без НДС (тариф). */
  readonly tariffNoVat: number;
  /** Ставка предоставления за вагон, без НДС = round(тариф × (1 + наценка%/100)). */
  readonly provisionNoVat: number;
  /** Тариф с НДС 22%. */
  readonly tariffWithVat: number;
  /** Ставка предоставления с НДС 22%. */
  readonly provisionWithVat: number;
}

export interface MatrixRow {
  /** Метка строки Табл.5 ("1" | "2" | "3-5" | "6-20" | "свыше 20"). */
  readonly band: string;
  /** Человекочитаемая метка группы. */
  readonly bandLabel: string;
  /** Представительное число вагонов, на котором посчитана строка. */
  readonly representativeCount: number;
  /** Обычный полувагон (г/п classicCapacityT). */
  readonly classic: MatrixCell;
  /** Инновационный полувагон (г/п innovativeCapacityT, ×0,9595). */
  readonly innovative: MatrixCell;
}

export interface MatrixResult {
  readonly scope: "supported" | "out-of-scope";
  readonly confidence: "green" | "yellow" | "red";
  readonly distanceKm: number | null;
  readonly distanceLegs: ReadonlyArray<{ kind: string; km: number }>;
  readonly tariffClass: 1 | 2 | 3 | null;
  readonly etsngCode: string;
  readonly etsngName: string | null;
  readonly classicCapacityT: number;
  readonly innovativeCapacityT: number;
  readonly markupPct: number;
  readonly vatRate: number;
  readonly rows: readonly MatrixRow[];
  readonly warnings: readonly string[];
}

export interface MatrixInput {
  readonly originEsr: string;
  readonly destEsr: string;
  readonly etsngCode?: string;
  readonly classicCapacityT?: number;
  readonly innovativeCapacityT?: number;
  readonly markupPct?: number;
}

function withVat(amount: number): number {
  return Math.round(amount * (1 + VAT_RATE_DOMESTIC / 100));
}

function provisionOf(tariffNoVat: number, markupPct: number): number {
  const resolved = resolveAmount({ kind: "tariff_plus_markup", markupPct }, tariffNoVat);
  // tariff_plus_markup всегда разрешимо при положительном tariffBase; на всякий случай — фолбэк.
  return resolved.amount ?? tariffNoVat;
}

function buildCell(
  data: N8TariffData,
  distKm: number,
  capacityT: number,
  innovative: boolean,
  representativeCount: number,
  markupPct: number,
): MatrixCell {
  const wagon = computeWagonN8(
    { wagonNo: "1", capacityT, innovative },
    data,
    distKm,
    representativeCount,
  );
  const tariffNoVat = wagon.tariffRub;
  const provisionNoVat = provisionOf(tariffNoVat, markupPct);
  return {
    tariffNoVat,
    provisionNoVat,
    tariffWithVat: withVat(tariffNoVat),
    provisionWithVat: withVat(provisionNoVat),
  };
}

/**
 * ЧИСТАЯ часть: матрица 5 групп × {обычный, инновационный} на готовом расстоянии.
 * distKm — тарифное расстояние (из движка ТР-4), НЕ воздушная линия.
 */
export function buildMatrixCells(
  distKm: number,
  data: N8TariffData,
  classicCapacityT: number,
  innovativeCapacityT: number,
  markupPct: number,
): MatrixRow[] {
  return BANDS.map((b) => ({
    band: b.band,
    bandLabel: b.label,
    representativeCount: b.representativeCount,
    classic: buildCell(data, distKm, classicCapacityT, false, b.representativeCount, markupPct),
    innovative: buildCell(
      data,
      distKm,
      innovativeCapacityT,
      true,
      b.representativeCount,
      markupPct,
    ),
  }));
}

function emptyMatrix(
  base: Omit<MatrixResult, "rows" | "scope" | "confidence" | "warnings">,
  scope: "supported" | "out-of-scope",
  confidence: "green" | "yellow" | "red",
  warnings: readonly string[],
): MatrixResult {
  return { ...base, scope, confidence, rows: [], warnings };
}

/**
 * Async-обёртка: расстояние (ТР-4) → класс ЕТСНГ → scope-guard (own ПВ, класс 1, домашнее) →
 * чистый расчёт матрицы. Вне контура цену не выдаёт — возвращает расстояние + причину.
 */
export async function computeQuoteMatrix(input: MatrixInput): Promise<MatrixResult> {
  const etsngCode = (input.etsngCode ?? DEFAULT_ETSNG_CODE).trim();
  const classicCapacityT = input.classicCapacityT ?? DEFAULT_CLASSIC_CAPACITY_T;
  const innovativeCapacityT = input.innovativeCapacityT ?? DEFAULT_INNOVATIVE_CAPACITY_T;
  const markupPct = input.markupPct ?? DEFAULT_MARKUP_PCT;

  const dist = await resolveDistance({
    originEsr: input.originEsr,
    destEsr: input.destEsr,
    emptyRun: false,
  });
  const distanceLegs = dist.legs.map((l) => ({ kind: l.kind, km: l.km }));

  const etsng = lookupEtsng(etsngCode);
  const tariffClass = etsng?.tariffClass ?? null;
  const etsngName = etsng?.name ?? null;

  const base = {
    distanceKm: dist.km,
    distanceLegs,
    tariffClass,
    etsngCode,
    etsngName,
    classicCapacityT,
    innovativeCapacityT,
    markupPct,
    vatRate: VAT_RATE_DOMESTIC,
  };

  // ── Scope guard (повторяем контур computeRzdQuote) ──────────────────────────
  const outOfScope: string[] = [];
  if (isForeignEsr(input.originEsr) || isForeignEsr(input.destEsr)) {
    outOfScope.push(
      "международная перевозка (станция СНГ/Балтии) — домашний ТР-1 2026 не применим",
    );
  }
  if (tariffClass !== null && tariffClass !== 1) {
    outOfScope.push(`класс груза ${tariffClass} вне контура (валидирован класс 1, нерудные)`);
  }

  if (dist.km === null) {
    return emptyMatrix(base, outOfScope.length ? "out-of-scope" : "supported", "red", [
      "Расстояние не определено: граф не нашёл тарифного маршрута.",
      ...outOfScope,
      ...dist.warnings,
    ]);
  }

  if (outOfScope.length > 0 || tariffClass === null) {
    return emptyMatrix(base, "out-of-scope", "red", [
      "Расчёт пропущен — параметры вне валидированного до-рубля контура:",
      ...outOfScope,
      ...(tariffClass === null
        ? [`код ЕТСНГ ${etsngCode} не найден / класс не определён`]
        : []),
      "Расстояние посчитано — цену занесите вручную.",
    ]);
  }

  const rows = buildMatrixCells(
    dist.km,
    loadN8TariffData(),
    classicCapacityT,
    innovativeCapacityT,
    markupPct,
  );

  const confidence: "green" | "yellow" | "red" =
    dist.confidence === "green" ? "green" : dist.confidence === "yellow" ? "yellow" : "red";

  return { ...base, scope: "supported", confidence, rows, warnings: dist.warnings };
}
