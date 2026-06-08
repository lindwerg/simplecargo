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
  C_NERUD_PV,
  computeK1N8,
  n8base,
  resolveK4,
} from "./computeTariffN8";
import type { InventoryTariffData, V4Belt } from "./inventoryData";

export interface InventoryResult {
  /** И-компонента (инфраструктура+локомотив), ₽/ваг, округлена до рубля. */
  readonly iComponent: number;
  /** В-компонента (вагонная составляющая), ₽/ваг. */
  readonly vComponent: number;
  /** Тариф инвентарного парка И+В, ₽/ваг, без НДС. */
  readonly inventoryNoVat: number;
  readonly k1: number;
  readonly k4: number;
}

/** Снап В4-ставки к поясу расстояния (интерполяция запрещена). */
function v4At(belts: readonly V4Belt[], distKm: number): number {
  const belt = belts.find((b) => distKm >= b.distFromKm && distKm <= b.distToKm);
  if (!belt) {
    throw new Error(`В4: нет пояса для ${distKm} км`);
  }
  return belt.rateRub;
}

/**
 * Тариф инвентарного парка (И1 + В4) за вагон, без НДС. distKm — тарифное расстояние,
 * wagonCount — число вагонов в отправке (для K4 отправочного, как в N8).
 */
export function computeInventoryPV(
  capacityT: number,
  distKm: number,
  wagonCount: number,
  data: InventoryTariffData,
): InventoryResult {
  const iBase = n8base(data.i1Grid, capacityT, distKm);
  const k1 = computeK1N8(data.classCoeff, distKm);
  const k4r = resolveK4(data.k4Belts, data.i1Grid, capacityT, wagonCount, distKm, iBase);

  const iComponent = Math.round(iBase * C_NERUD_PV * k1 * k4r.k4);
  const vComponent = Math.round(v4At(data.v4Belts, distKm));

  return {
    iComponent,
    vComponent,
    inventoryNoVat: iComponent + vComponent,
    k1,
    k4: k4r.k4,
  };
}
