// Тариф инвентарного (общего) парка РЖД — CERTIFIED R-Тариф структура (ENGINE FIX 3, 2026-06-09).
//
// Выверено ДО КОПЕЙКИ против двух реальных эталонов R-Тариф v19.59
// (reference-quotes-batch-0609.json inventory_cases), Тёплая Гора→Койты 1409 км, 70т, щебень cls1:
//   • INV-1   повагонная (1 ваг) = 110170 ₽ без НДС
//   • INV-6_20 групповая (6 ваг)  = 105804 ₽ без НДС
//
// Структура провозной платы инвентарного парка (НДС последним):
//
//   Схема8(груженый) = (N8base(масса,L) ± K4[group,L] на СЫРОЙ базе)
//                       × K1(class1,L) × 0,77(нерудный) × 0,909(нерудный-ПВ п.1.5) × 1,01
//       — БЕЗ коэф.рода 0,9346 (он только у собственного парка) и БЕЗ инноваций 0,9595.
//   Схема25(1)(порожний) = (emptyBase(оси, 60%·L) ± K4[group, 60%·L]) × 1,06(порожний) × 1,01,
//                          затем × число осей. Порожний пробег = 60% тарифного расстояния.
//   СхемаВ(scheme) = Вbase(L) × 1,01   // вагонная составляющая, distance-only, класс-независимая.
//   ИТОГО без НДС = round( Схема8 + Схема25(1) + СхемаВ − 754 ).
//     − 754 = R-Тариф «Скидка с общего тарифа на универсальные вагоны» (НЕ Табл.N12/N13/п.28.2;
//       согласует п.16.5.1 leg-sum с комбинированным И1). PROVEN FLAT vs INV-1/INV-6_20 (753,86/
//       754,32 → флэт 754 при противоположном знаке K4). См. docs/planning/INVENTORY_754_RESOLUTION.md.
//
// K4 — отправочный п.16.7 знаковый max-of-two на СЫРОЙ базе (resolveK4 variant): candCur =
// base(L)×(k_тек−1), candPrev = base(нижняя_граница)×(k_пред−1); берётся больший по модулю.
// Все коэффициенты — sourced (894/25 Прил.N2 + Табл.2/4/5), ничего не выдумано.
//
// confidence: yellow = посчитано по официальным таблицам и СВЕРЕНО до рубля с R-Тарифом общего
// парка (INV-1/INV-6_20). red = род использует 1D-схему/коэффициент не закреплён → число не выдаём.

import {
  C_K3_NERUD,
  C_NERUD_PV_GONDOLA,
  computeK1N8,
  n8base,
  round01,
} from "./computeTariffN8";
import type { EmptyRunBaseBelt, InventoryTariffData, V4Belt } from "./inventoryData";

/** Доверие к инвентарной строке: red = схема/коэффициент не закреплены, число не выдаём. */
export type InventoryConfidence = "yellow" | "red";

/**
 * −754 ₽/вагон: R-Тариф строка «Скидка с общего тарифа на универсальные вагоны».
 * НЕ нумерованное уменьшение ТР-1 (НЕ Табл.N12/N13/п.28.2 — те только контейнер/контрейлер
 * FCL; для щебня в полувагоне неприменимы). Согласует п.16.5.1 разложение на три ноги
 * (N8 + порожний 25(1)@60% + группа В) с опубликованным комбинированным тарифом схемы И1
 * общего парка. PROVEN FLAT и сверено до копейки против двух эталонов R-Тариф (INV-1 110170,
 * INV-6_20 105804): требуемая скидка 753,86 и 754,32 — обе скобки целого 754 ДО п.15.5 округления,
 * при ПРОТИВОПОЛОЖНОМ знаке K4 → значит флэт, не формула. confidence: corroborated-by-oracle,
 * НЕ sourced-by-rule (полное обоснование: docs/planning/INVENTORY_754_RESOLUTION.md).
 * НЕ выводить формулой (флэт — формула была бы фабрикацией) и НЕ удалять (откроет ошибку 754 ₽/ваг).
 */
const INVENTORY_DISCOUNT = 754;
/** Коэффициент порожнего пробега (×1,06). */
const C_POROZH = 1.06;
/** Доп.индексация ×1,01 — последний множитель каждой составляющей. */
const C_DOP_INDEX = 1.01;
/** Доля тарифного расстояния для порожнего пробега (60%). */
const POROZH_DISTANCE_FRACTION = 0.6;
/** Стандартное число осей вагона. */
const DEFAULT_AXLES = 4;

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
   * yellow = посчитано из официальных таблиц И СВЕРЕНО до рубля с R-Тарифом общего парка
   * (INV-1/INV-6_20). red = схема/коэффициент рода не закреплены — НЕ выдаём число.
   */
  readonly confidence: InventoryConfidence;
  /** Причина red (для UI/диагностики). null при yellow. */
  readonly redReason: string | null;
}

/**
 * Привязка рода вагона к схемам инвентарного (общего) парка: груженый N8 + порожний 25/25(1)
 * + вагонная составляющая В(scheme). Только универсальные вагоны (ПВ/ПЛ) закрыты «yellow»;
 * для крытого (КР) нерудный п.1.5 ×0,909 НЕ применяется → коэффициент не выверен → red. Для
 * специализированных/цистерн/реф (1D-схемы И2-И17, номер не закреплён) — red.
 */
interface InventorySchemeMap {
  readonly vScheme: string;
  readonly emptyScheme: string;
  /** true → нерудный п.1.5 ×0,909 применяется (ПВ, ПЛ); false → не применяется (КР). */
  readonly nerudGondolaP15: boolean;
}

const INVENTORY_SCHEMES: Readonly<Record<string, InventorySchemeMap>> = {
  ПВ: { vScheme: "В4", emptyScheme: "25(1)", nerudGondolaP15: true },
  ПЛ: { vScheme: "В1", emptyScheme: "25(1)", nerudGondolaP15: true },
  // КР: В3 + порожний 25, но без п.1.5 ×0,909 → коэффициент не выверен → red ниже.
  КР: { vScheme: "В3", emptyScheme: "25", nerudGondolaP15: false },
};

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

/** Снап В-ставки к поясу расстояния (интерполяция запрещена). */
function vAt(belts: readonly V4Belt[], distKm: number, scheme: string): number {
  const belt = belts.find((b) => distKm >= b.distFromKm && distKm <= b.distToKm);
  if (!belt) {
    throw new Error(`${scheme}: нет пояса для ${distKm} км`);
  }
  return belt.rateRub;
}

/** Снап порожней per-axle ставки к поясу расстояния по схеме и числу осей. */
function emptyAt(
  belts: readonly EmptyRunBaseBelt[],
  scheme: string,
  axles: number,
  distKm: number,
): number {
  const belt = belts.find(
    (b) => b.axles === axles && distKm >= b.distFromKm && distKm <= b.distToKm,
  );
  if (!belt) {
    throw new Error(`${scheme}/${axles}ос: нет порожнего пояса для ${distKm} км`);
  }
  return belt.rateRub;
}

/** Карта счёта вагонов → группа Табл.5 (как k4GroupForWagons). */
function k4Group(wagonCount: number): string {
  if (wagonCount === 1) return "1";
  if (wagonCount === 2) return "2";
  if (wagonCount >= 3 && wagonCount <= 5) return "3-5";
  if (wagonCount >= 6 && wagonCount <= 20) return "6-20";
  return "свыше 20";
}

/**
 * K4 знаковая поправка (п.16.7 max-of-two) на СЫРОЙ базе, общая для груженого (N8) и порожнего
 * (25/25(1)) пути инвентарного парка: candCur = baseAt(L)×(k_тек−1), candPrev =
 * baseAt(нижняя_граница)×(k_пред−1) [0 в первом поясе], берётся больший по модулю (round01 each).
 * `baseAt(L)` — функция базы по расстоянию (N8base(масса,·) или emptyBase(оси,·)).
 */
function k4Correction(
  k4Belts: readonly { shipmentGroup: string; distFromKm: number; distToKm: number; k: number }[],
  group: string,
  distKm: number,
  baseAt: (L: number) => number,
): { correction: number; k4: number } {
  const cur = k4Belts.find(
    (b) => b.shipmentGroup === group && distKm >= b.distFromKm && distKm <= b.distToKm,
  );
  if (!cur) {
    throw new Error(`K4: нет Табл.5 строки '${group}' на ${distKm} км`);
  }
  const baseCur = baseAt(distKm);
  const candCur = round01(baseCur * (cur.k - 1));

  const lowerKm = cur.distFromKm - 1;
  const prev = k4Belts.find((b) => b.shipmentGroup === group && b.distToKm === lowerKm);
  let candPrev = 0;
  if (prev && lowerKm >= 1) {
    candPrev = round01(baseAt(lowerKm) * (prev.k - 1));
  }

  const correction = Math.abs(candPrev) >= Math.abs(candCur) ? candPrev : candCur;
  const k4 = baseCur !== 0 ? (baseCur + correction) / baseCur : 1;
  return { correction, k4 };
}

/**
 * Тариф инвентарного парка по роду вагона (груженый N8 + порожний 25(1) + В), за вагон без НДС.
 * Выверено до рубля для ПВ/ПЛ class-1 нерудных (INV-1=110170, INV-6_20=105804). Число выдаётся
 * ТОЛЬКО при yellow; при red — null + причина (не фабрикуем правдоподобное).
 *
 * capacityT — расчётная (billable) масса в тоннах (max(факт, мин.весовая норма) — для нерудных
 *   щебня = факт=г/п). distKm — тарифное расстояние. wagonCount — число вагонов (для K4 группы).
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
      `Род вагона «${wagonTypeCode}» (порожний ${map.emptyScheme}+${map.vScheme}): нерудный ` +
        `коэффициент Табл.4 п.1.5 ×0,909 относится только к полувагонам и платформам — для ` +
        `крытого он не применяется, а коэффициент рода не выверен ни против одного эталона ` +
        `R-Тариф. Инвентарный тариф не выдаём.`,
    );
  }

  const group = k4Group(wagonCount);
  const k1 = computeK1N8(data.classCoeff, distKm);

  // ── Схема8 (груженый): N8 base ± K4 (СЫРАЯ база) × K1 × 0,77 × 0,909 × 1,01 ───────
  // п.15.4 PER-STEP kopeck rounding (round01 after each ×coefficient) — mirror the certified
  // computeTariffN8 chain instead of one float product rounded once. Verified no-op on the
  // INV-1/INV-6_20 R-Тариф oracles (single-float == per-step → 110170/105804 to the ruble).
  const n8At = (L: number): number => n8base(data.n8Grid, capacityT, L);
  const loadedK4 = k4Correction(data.k4Belts, group, distKm, n8At);
  const loadedBase = round01(n8base(data.n8Grid, capacityT, distKm) + loadedK4.correction);
  let loaded = round01(loadedBase * k1);
  loaded = round01(loaded * C_K3_NERUD);
  loaded = round01(loaded * C_NERUD_PV_GONDOLA);
  loaded = round01(loaded * C_DOP_INDEX);

  // ── Схема25(1) (порожний): emptyBase(оси, 60%·L) ± K4 × 1,06 × 1,01 × оси ─────────
  const emptyBelts = data.emptyBeltsByScheme[map.emptyScheme];
  if (!emptyBelts || emptyBelts.length === 0) {
    return redResult(`Порожняя схема ${map.emptyScheme} не загружена.`);
  }
  const axles = DEFAULT_AXLES;
  const emptyDistKm = Math.round(distKm * POROZH_DISTANCE_FRACTION);
  const emptyAtFn = (L: number): number => emptyAt(emptyBelts, map.emptyScheme, axles, L);
  const emptyK4 = k4Correction(data.k4Belts, group, emptyDistKm, emptyAtFn);
  let emptyPerAxle = round01(
    emptyAt(emptyBelts, map.emptyScheme, axles, emptyDistKm) + emptyK4.correction,
  );
  emptyPerAxle = round01(emptyPerAxle * C_POROZH);
  emptyPerAxle = round01(emptyPerAxle * C_DOP_INDEX);
  const emptyLeg = round01(emptyPerAxle * axles);

  // ── СхемаВ (вагонная составляющая): Вbase(L) × 1,01 ───────────────────────────────
  const vBelts = data.vBeltsByScheme[map.vScheme];
  if (!vBelts || vBelts.length === 0) {
    return redResult(`Вагонная составляющая ${map.vScheme} не загружена.`);
  }
  const vLeg = round01(vAt(vBelts, distKm, map.vScheme) * C_DOP_INDEX);

  // ── ИТОГО без НДС = round( Схема8 + Схема25(1) + СхемаВ − 754 ) ───────────────────
  const inventoryNoVat = Math.round(loaded + emptyLeg + vLeg - INVENTORY_DISCOUNT);

  // Раздельные И/В для отображения: И = груженый + порожний (инфраструктурно-тяговая часть),
  // В = вагонная составляющая (округлены до рубля). Сумма И+В − скидка ≈ inventoryNoVat
  // (округление суммы — последним; раздельные числа — для прозрачности, не для повторного сложения).
  const iComponent = Math.round(loaded + emptyLeg);
  const vComponent = Math.round(vLeg);

  return {
    iComponent,
    vComponent,
    inventoryNoVat,
    k1,
    k4: loadedK4.k4,
    confidence: "yellow",
    redReason: null,
  };
}
