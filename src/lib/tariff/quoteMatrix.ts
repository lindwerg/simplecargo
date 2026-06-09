// Матрица «обычный/инновационный × группы отправки» для голосового быстрого расчёта.
//
// За вагон считаются ТРИ числа:
//   • собственный тариф (своя цена N8, выверена до рубля) — зависит от типа вагона и группы;
//   • тариф инвентарного парка (И+В по роду вагона: ПВ→И1+В4, ПЛ→И1+В1) — ⚠️ НЕ выверен (нет
//     эталона R-Тариф общего парка); для крытого/спец-вагонов схема/коэффициент не закреплены →
//     число НЕ выдаётся (red, inventoryRedReason), а не правдоподобная подстановка;
//   • ставка предоставления = инвентарный × коэффициент собственника (вводится оператором).
//
// buildMatrixCells — ЧИСТАЯ (готовый distKm). computeQuoteMatrix — async-обёртка: расстояние
// (ТР-4) + класс ЕТСНГ + scope-guard + расчёт. Вне контура (own ПВ, класс 1, домашнее) цену
// собственного парка не выдаёт; инвентарный/предоставление помечаются «проверяется» в UI.

import { resolveDistance } from "@/lib/distance/repository";
import { isForeignEsr } from "@/lib/distance/foreignStations";
import {
  computeWagonN8,
  type N8TariffData,
} from "@/lib/tariff/computeTariffN8";
import { computeInventory } from "@/lib/tariff/computeInventory";
import { loadInventoryTariffData, type InventoryTariffData } from "@/lib/tariff/inventoryData";
import { loadN8TariffData } from "@/lib/tariff/n8Data";
import { lookupEtsng, VAT_RATE_DOMESTIC } from "@/lib/tariff/quoteService";

/** Груз по умолчанию, если не назван: щебень (класс 1, нерудные). */
export const DEFAULT_ETSNG_CODE = "232431";
/** Дефолтная грузоподъёмность обычного полувагона, т. */
export const DEFAULT_CLASSIC_CAPACITY_T = 70;
/** Дефолтная грузоподъёмность инновационного полувагона, т. */
export const DEFAULT_INNOVATIVE_CAPACITY_T = 75;
/** Коэффициент собственника по умолчанию (× к инвентарному тарифу). Оператор вводит своё. */
export const DEFAULT_OWNER_COEFF = 1.15;
/** Род вагона по умолчанию: полувагон (нерудные class 1, выверенный собственный путь). */
export const DEFAULT_WAGON_TYPE = "ПВ";

/**
 * Группы отправки ТР-1 (Табл.5) и представительное число вагонов для k4GroupForWagons:
 * 1→"1", 2→"2", 4→"3-5", 6→"6-20", 25→"свыше 20".
 */
const BANDS: ReadonlyArray<{ band: string; representativeCount: number; label: string }> = [
  { band: "1", representativeCount: 1, label: "Повагонная (1 ваг)" },
  { band: "2", representativeCount: 2, label: "Группа (2 ваг)" },
  { band: "3-5", representativeCount: 4, label: "Группа (3–5 ваг)" },
  { band: "6-20", representativeCount: 6, label: "Группа (6–20 ваг)" },
  { band: "свыше 20", representativeCount: 25, label: "Маршрут (свыше 20)" },
];

export interface MatrixCell {
  /** Собственный тариф (своя цена N8), ₽/ваг, без НДС — выверен до рубля. */
  readonly tariffNoVat: number;
  readonly tariffWithVat: number;
  /**
   * Тариф инвентарного парка (И+В), ₽/ваг, без НДС. ⚠️ НЕ выверен (проверяется) при yellow;
   * null при red (схема/коэффициент рода вагона не закреплены — число не выдаём).
   */
  readonly inventoryNoVat: number | null;
  readonly inventoryWithVat: number | null;
  /** Ставка предоставления = round(инвентарный × коэффициент собственника), без НДС. null при red. */
  readonly provisionNoVat: number | null;
  readonly provisionWithVat: number | null;
  /** yellow = «проверяется»; red = не выдано (см. inventoryRedReason). */
  readonly inventoryConfidence: "yellow" | "red";
  readonly inventoryRedReason: string | null;
}

export interface MatrixRow {
  readonly band: string;
  readonly bandLabel: string;
  readonly representativeCount: number;
  /** Обычный полувагон (г/п classicCapacityT). */
  readonly classic: MatrixCell;
  /** Инновационный полувагон (г/п innovativeCapacityT, ×0,9595 только в собственном тарифе). */
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
  /** Коэффициент собственника (× к инвентарному тарифу для ставки предоставления). */
  readonly ownerCoeff: number;
  /** Род вагона (ПВ/ПЛ/КР…), для которого посчитан инвентарный/предоставление. */
  readonly wagonType: string;
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
  readonly ownerCoeff?: number;
  /** Род вагона для инвентарного/предоставления (ПВ/ПЛ/КР…). По умолчанию ПВ. */
  readonly wagonType?: string;
}

function withVat(amount: number): number {
  return Math.round(amount * (1 + VAT_RATE_DOMESTIC / 100));
}

function buildCell(
  n8Data: N8TariffData,
  invData: InventoryTariffData,
  wagonTypeCode: string,
  distKm: number,
  capacityT: number,
  innovative: boolean,
  representativeCount: number,
  ownerCoeff: number,
): MatrixCell {
  const wagon = computeWagonN8(
    { wagonNo: "1", capacityT, innovative },
    n8Data,
    distKm,
    representativeCount,
  );
  const tariffNoVat = wagon.tariffRub;

  const inv = computeInventory(wagonTypeCode, capacityT, distKm, representativeCount, invData);

  // red → число не выдаём (null), причина пробрасывается в UI; yellow → «проверяется».
  if (inv.confidence === "red" || inv.inventoryNoVat === null) {
    return {
      tariffNoVat,
      tariffWithVat: withVat(tariffNoVat),
      inventoryNoVat: null,
      inventoryWithVat: null,
      provisionNoVat: null,
      provisionWithVat: null,
      inventoryConfidence: "red",
      inventoryRedReason: inv.redReason,
    };
  }

  const inventoryNoVat = inv.inventoryNoVat;
  const provisionNoVat = Math.round(inventoryNoVat * ownerCoeff);

  return {
    tariffNoVat,
    tariffWithVat: withVat(tariffNoVat),
    inventoryNoVat,
    inventoryWithVat: withVat(inventoryNoVat),
    provisionNoVat,
    provisionWithVat: withVat(provisionNoVat),
    inventoryConfidence: "yellow",
    inventoryRedReason: null,
  };
}

/**
 * ЧИСТАЯ часть: матрица 5 групп × {обычный, инновационный} на готовом расстоянии.
 * distKm — тарифное расстояние (из движка ТР-4). wagonTypeCode по умолчанию ПВ (полувагон).
 */
export function buildMatrixCells(
  distKm: number,
  n8Data: N8TariffData,
  invData: InventoryTariffData,
  classicCapacityT: number,
  innovativeCapacityT: number,
  ownerCoeff: number,
  wagonTypeCode: string = DEFAULT_WAGON_TYPE,
): MatrixRow[] {
  return BANDS.map((b) => ({
    band: b.band,
    bandLabel: b.label,
    representativeCount: b.representativeCount,
    classic: buildCell(n8Data, invData, wagonTypeCode, distKm, classicCapacityT, false, b.representativeCount, ownerCoeff),
    innovative: buildCell(n8Data, invData, wagonTypeCode, distKm, innovativeCapacityT, true, b.representativeCount, ownerCoeff),
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
  const ownerCoeff = input.ownerCoeff ?? DEFAULT_OWNER_COEFF;
  const wagonType = (input.wagonType ?? DEFAULT_WAGON_TYPE).trim() || DEFAULT_WAGON_TYPE;

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
    ownerCoeff,
    wagonType,
    vatRate: VAT_RATE_DOMESTIC,
  };

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
    loadInventoryTariffData(),
    classicCapacityT,
    innovativeCapacityT,
    ownerCoeff,
    wagonType,
  );

  const confidence: "green" | "yellow" | "red" =
    dist.confidence === "green" ? "green" : dist.confidence === "yellow" ? "yellow" : "red";

  return { ...base, scope: "supported", confidence, rows, warnings: dist.warnings };
}
