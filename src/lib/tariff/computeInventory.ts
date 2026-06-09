// Тариф инвентарного (общего) парка РЖД для полувагона: И1 + В4. PURE (таблицы инжектятся).
//
// Формула (вскрыта ultracode-разведкой по docs/planning + seed, ТР-1 2026, п.16.5.1):
//
//   И = round( И1base(round(capacityT), L) × 0,69993 × K1(class1, L) × K4(group, L) )
//       где 0,69993 = 0,77 нерудный × 0,909 доп. ПВ-нерудный (K3-комб, как в N8);
//       K1 — Табл.2 класс-1; K4 — Табл.5 отправочный, тот же выверенный механизм п.16.7
//       (resolveK4), но candLo/candHi берутся из И1-сетки, НЕ из N8-сетки.
//       БЕЗ C_OWN_PV_CLASS1 (0,9346 — собственный коэф), БЕЗ ×0,9595 (инноваций нет в общем
//       парке), БЕЗ ×1,01 доп.индексации (нет данных, что общий парк её несёт).
//   В = В4base(L)   // distance-only, КЛАСС-НЕЗАВИСИМАЯ, без коэффициентов.
//   инвентарный (И+В, без НДС) = И + В.
//
// ⚠️ НЕ ВЫВЕРЕНО до рубля: эталона R-Тариф общего парка нет (кейсы C16–C20 в
// RTARIFF_VALIDATION_CASES.md помечены gap). Применимость K1/K3/K4 к И-части и
// класс-независимость В4 инферированы по аналогии с собственным путём. Выдавать ТОЛЬКО
// с пометкой «проверяется», пока оператор не даст разбор И+В одной квитанции общего парка.

import {
  C_K3_NERUD,
  C_NERUD_PV,
  C_NERUD_PV_GONDOLA,
  computeK1N8,
  n8base,
  resolveK4,
} from "./computeTariffN8";
import type { InventoryTariffData, V4Belt } from "./inventoryData";

/** Доверие к инвентарной строке: red = схема/коэффициент не закреплены, число не выдаём. */
export type InventoryConfidence = "yellow" | "red";

export interface InventoryResult {
  /** И-компонента (инфраструктура+локомотив), ₽/ваг, округлена до рубля. null при red. */
  readonly iComponent: number | null;
  /** В-компонента (вагонная составляющая), ₽/ваг. null при red. */
  readonly vComponent: number | null;
  /** Тариф инвентарного парка И+В, ₽/ваг, без НДС. null при red (число не выдаём). */
  readonly inventoryNoVat: number | null;
  readonly k1: number | null;
  readonly k4: number | null;
  /**
   * yellow = посчитано из официальных И1+В таблиц, но НЕ сверено до рубля с R-Тарифом общего
   * парка (банер «проверяется»). red = схема/коэффициент Табл.4 не закреплены — НЕ выдаём число.
   */
  readonly confidence: InventoryConfidence;
  /** Причина red (для UI/диагностики). null при yellow. */
  readonly redReason: string | null;
}

/**
 * Привязка рода вагона к И/В-схемам инвентарного (общего) парка ТР-1 2026 (Табл.N6/N7,
 * tr1-scheme-classifier-extended.json, ownership=rzd). Только универсальные вагоны на 2D-схеме И1
 * закрыты «high»; для специализированных (1D-схемы И2-И17, не закреплён конкретный номер) — red.
 *
 * Коэффициент Табл.4 п.1.5 (×0,909) для нерудных ЕТСНГ 231-236/241-246 применяется в
 * «универсальных полувагонах И ПЛАТФОРМАХ» (tr1-class-k3-full-verify.json task2 verbatim) —
 * значит ПВ и ПЛ делят C_NERUD_PV. Крытый (КР) НЕ в списке п.1.5 → ×0,909 НЕ применяется →
 * коэффициент иной и НЕ выверен ни против одного эталона → red (не фабрикуем число).
 */
interface InventorySchemeMap {
  readonly iScheme: "И1";
  readonly vScheme: string;
  /** true → нерудный п.1.5 ×0,909 применяется (ПВ, ПЛ); false → не применяется (КР). */
  readonly nerudGondolaP15: boolean;
}

const INVENTORY_SCHEMES: Readonly<Record<string, InventorySchemeMap>> = {
  ПВ: { iScheme: "И1", vScheme: "В4", nerudGondolaP15: true },
  ПЛ: { iScheme: "И1", vScheme: "В1", nerudGondolaP15: true },
  // КР: И1 + В3, но без п.1.5 ×0,909 → коэффициент не выверен → помечается red ниже.
  КР: { iScheme: "И1", vScheme: "В3", nerudGondolaP15: false },
};

/** Снап В-ставки к поясу расстояния (интерполяция запрещена). */
function vAt(belts: readonly V4Belt[], distKm: number, scheme: string): number {
  const belt = belts.find((b) => distKm >= b.distFromKm && distKm <= b.distToKm);
  if (!belt) {
    throw new Error(`${scheme}: нет пояса для ${distKm} км`);
  }
  return belt.rateRub;
}

function redResult(reason: string): InventoryResult {
  return {
    iComponent: null,
    vComponent: null,
    inventoryNoVat: null,
    k1: null,
    k4: null,
    confidence: "red",
    redReason: reason,
  };
}

/**
 * Тариф инвентарного парка (И1 + В4) за вагон, без НДС — ПОЛУВАГОН, нерудные class 1.
 * Backward-compatible: возвращает гарантированно non-null числа (golden @1367 regression-lock).
 * distKm — тарифное расстояние, wagonCount — число вагонов в отправке (для K4 отправочного).
 */
export function computeInventoryPV(
  capacityT: number,
  distKm: number,
  wagonCount: number,
  data: InventoryTariffData,
): InventoryResult & { iComponent: number; vComponent: number; inventoryNoVat: number } {
  const iBase = n8base(data.i1Grid, capacityT, distKm);
  const k1 = computeK1N8(data.classCoeff, distKm);
  const k4r = resolveK4(data.k4Belts, data.i1Grid, capacityT, wagonCount, distKm, iBase);

  const iComponent = Math.round(iBase * C_NERUD_PV * k1 * k4r.k4);
  const vComponent = Math.round(vAt(data.v4Belts, distKm, "В4"));

  return {
    iComponent,
    vComponent,
    inventoryNoVat: iComponent + vComponent,
    k1,
    k4: k4r.k4,
    confidence: "yellow",
    redReason: null,
  };
}

/**
 * ОБОБЩЁННЫЙ тариф инвентарного (общего) парка по роду вагона. Для нерудных class-1:
 *   • ПВ / ПЛ → И1 (2D) × нерудный 0,77 × п.1.5 0,909 × K1 × K4 + В(scheme) — yellow «проверяется»;
 *   • КР      → И1, но п.1.5 0,909 НЕ применим (Табл.4) → коэффициент не выверен → red;
 *   • спец/цистерна/реф/контейнер/транспортёр → 1D-схема не закреплена → red.
 * Число выдаётся ТОЛЬКО при yellow; при red — null + причина (не фабрикуем правдоподобное).
 */
export function computeInventory(
  wagonTypeCode: string,
  capacityT: number,
  distKm: number,
  wagonCount: number,
  data: InventoryTariffData,
): InventoryResult {
  const map = INVENTORY_SCHEMES[wagonTypeCode];
  if (!map) {
    return redResult(
      `Род вагона «${wagonTypeCode}» использует 1D-схему общего парка (И2-И17), ` +
        `конкретный номер схемы не закреплён в ТР-1 Табл.N7 (confidence medium/low) — ` +
        `инвентарный тариф не выдаём, занесите вручную.`,
    );
  }
  if (!map.nerudGondolaP15) {
    return redResult(
      `Род вагона «${wagonTypeCode}» (схема ${map.iScheme}+${map.vScheme}): нерудный коэффициент ` +
        `Табл.4 п.1.5 ×0,909 относится только к полувагонам и платформам — для крытого он не ` +
        `применяется, а собственный коэффициент рода не выверен ни против одного эталона R-Тариф. ` +
        `Инвентарный тариф не выдаём.`,
    );
  }

  const iBase = n8base(data.i1Grid, capacityT, distKm);
  const k1 = computeK1N8(data.classCoeff, distKm);
  const k4r = resolveK4(data.k4Belts, data.i1Grid, capacityT, wagonCount, distKm, iBase);

  // ПВ и ПЛ: нерудный 0,77 × п.1.5 0,909 = C_NERUD_PV (C_K3_NERUD × C_NERUD_PV_GONDOLA).
  const nerudCoeff = C_K3_NERUD * C_NERUD_PV_GONDOLA; // === C_NERUD_PV (0,69993)
  const iComponent = Math.round(iBase * nerudCoeff * k1 * k4r.k4);

  const vBelts = data.vBeltsByScheme[map.vScheme];
  if (!vBelts || vBelts.length === 0) {
    return redResult(`Вагонная составляющая ${map.vScheme} не загружена.`);
  }
  const vComponent = Math.round(vAt(vBelts, distKm, map.vScheme));

  return {
    iComponent,
    vComponent,
    inventoryNoVat: iComponent + vComponent,
    k1,
    k4: k4r.k4,
    confidence: "yellow",
    redReason: null,
  };
}
