// End-to-end РЖД-tariff orchestrator for the «Калькулятор» surface.
//
// Pipeline: resolveDistance (ТР-4) → ЕТСНГ class lookup → scope guard → N8 own-полувагон
// engine (computeQuoteN8) → НДС. It NEVER fabricates a number: outside the validated contour
// (собственный полувагон, класс 1, домашнее сообщение) or when the distance graph cannot
// resolve a route, it returns a red/yellow verdict with a human reason instead of a price.
//
// Validated contour = the path that reproduces both real квитанции to the ruble
// (ЭФ164189 2444 km = 1 067 770 ₽; ЭТ201459 699 km = 187 344 ₽).

import { resolveDistance } from "@/lib/distance/repository";
import { isForeignEsr } from "@/lib/distance/foreignStations";
import { loadEtsngFromSeed } from "@/lib/tariff/seedLoader";
import {
  computeQuoteN8,
  type N8WagonInput,
} from "@/lib/tariff/computeTariffN8";
import { loadN8TariffData } from "@/lib/tariff/n8Data";
import { computeInventory } from "@/lib/tariff/computeInventory";
import { loadInventoryTariffData } from "@/lib/tariff/inventoryData";

/** Domestic НДС from 2026-01-01 (ТР-1 tariffs are без НДС; applied last). */
export const VAT_RATE_DOMESTIC = 22;

export interface QuoteWagon {
  /** Грузоподъёмность, т (N8 lookup key after rounding). */
  readonly capacityT: number;
  /** Число вагонов этой грузоподъёмности в отправке. */
  readonly count: number;
  /** true → инновационный полувагон (×0.9595, Табл.6 п.3). */
  readonly innovative: boolean;
}

export interface QuoteInput {
  readonly originEsr: string;
  readonly destEsr: string;
  readonly etsngCode: string;
  readonly wagons: readonly QuoteWagon[];
  /** Только 'own' валидирован до рубля; 'rzd' → out-of-scope. */
  readonly ownership: "own" | "rzd";
  /** Только 'полувагон' валидирован; иное → out-of-scope. */
  readonly wagonType: string;
  /**
   * Коэффициент собственника (× к инвентарному И+В) — если задан, дополнительно
   * считаются инвентарный тариф и ставка предоставления (отдельный блок, не сумма).
   */
  readonly ownerCoeff?: number;
}

export interface QuotePerWagon {
  readonly capacityT: number;
  readonly innovative: boolean;
  readonly n8: number;
  readonly k1: number;
  readonly k4: number;
  readonly k4Fitted: boolean;
  readonly tariffRub: number;
}

/**
 * Блок «Предоставление» — отдельный от провозной платы расчёт для собственника:
 * инвентарный тариф И+В (⚠️ «проверяется») и ставка предоставления = инвентарный ×
 * коэффициент собственника. Суммы по всей отправке (perWagonProvision × count).
 */
export interface QuoteProvision {
  readonly ownerCoeff: number;
  /** Инвентарный И+В за вагон по группам г/п, ₽ без НДС (как в запросе wagons[]). */
  readonly perGroup: ReadonlyArray<{
    readonly capacityT: number;
    readonly count: number;
    readonly inventoryNoVat: number;
    readonly provisionNoVat: number;
  }>;
  readonly inventoryTotalNoVat: number;
  readonly provisionTotalNoVat: number;
  readonly provisionTotalWithVat: number;
}

export interface QuoteResult {
  readonly scope: "supported" | "out-of-scope";
  readonly confidence: "green" | "yellow" | "red";
  readonly distanceKm: number | null;
  readonly distanceConfidence: "green" | "yellow" | "red";
  readonly distanceLegs: ReadonlyArray<{ kind: string; km: number }>;
  readonly tariffClass: 1 | 2 | 3 | null;
  readonly etsngName: string | null;
  readonly perWagon: readonly QuotePerWagon[];
  readonly wagonCount: number;
  readonly totalNoVat: number | null;
  readonly vatRate: number;
  readonly totalWithVat: number | null;
  /** null — коэффициент не задан или инвентарный red (см. provisionRedReason). */
  readonly provision: QuoteProvision | null;
  /** Причина, по которой инвентарный/предоставление не выданы (red). */
  readonly provisionRedReason: string | null;
  readonly warnings: readonly string[];
}

/** Род вагона UI («полувагон») → код схемы инвентарного парка («ПВ»). */
const WAGON_TYPE_CODE: Readonly<Record<string, string>> = {
  полувагон: "ПВ",
  платформа: "ПЛ",
  крытый: "КР",
  цистерна: "ЦС",
};

/**
 * Инвентарный И+В + ставка предоставления по группам вагонов. Отдельный блок:
 * НЕ суммируется с провозной платой собственного парка. red инвентарного не
 * валит расчёт — возвращается причина.
 */
function computeProvision(
  wagons: readonly QuoteWagon[],
  wagonType: string,
  distKm: number,
  ownerCoeff: number,
): { provision: QuoteProvision | null; redReason: string | null } {
  const code = WAGON_TYPE_CODE[wagonType.trim().toLowerCase()] ?? wagonType.trim();
  const invData = loadInventoryTariffData();
  const wagonCount = wagons.reduce((s, w) => s + w.count, 0);

  const perGroup: Array<{
    capacityT: number;
    count: number;
    inventoryNoVat: number;
    provisionNoVat: number;
  }> = [];
  for (const w of wagons) {
    const inv = computeInventory(code, w.capacityT, distKm, wagonCount, invData);
    if (inv.confidence === "red" || inv.inventoryNoVat === null) {
      return {
        provision: null,
        redReason:
          inv.redReason ??
          `инвентарный тариф для рода вагона «${wagonType}» не закреплён — занесите ставку вручную`,
      };
    }
    perGroup.push({
      capacityT: w.capacityT,
      count: w.count,
      inventoryNoVat: inv.inventoryNoVat,
      provisionNoVat: Math.round(inv.inventoryNoVat * ownerCoeff),
    });
  }

  const inventoryTotalNoVat = perGroup.reduce((s, g) => s + g.inventoryNoVat * g.count, 0);
  const provisionTotalNoVat = perGroup.reduce((s, g) => s + g.provisionNoVat * g.count, 0);
  return {
    provision: {
      ownerCoeff,
      perGroup,
      inventoryTotalNoVat,
      provisionTotalNoVat,
      provisionTotalWithVat: Math.round(provisionTotalNoVat * (1 + VAT_RATE_DOMESTIC / 100)),
    },
    redReason: null,
  };
}

export function lookupEtsng(
  code: string,
): { tariffClass: 1 | 2 | 3; name: string } | null {
  const catalog = loadEtsngFromSeed();
  const hit = catalog.find((e) => e.code === code.trim());
  if (!hit) return null;
  return { tariffClass: hit.tariffClass, name: hit.name };
}

export async function computeRzdQuote(input: QuoteInput): Promise<QuoteResult> {
  const warnings: string[] = [];

  // ── 1. Distance (ТР-4) ────────────────────────────────────────────────────
  const dist = await resolveDistance({
    originEsr: input.originEsr,
    destEsr: input.destEsr,
    emptyRun: false,
  });
  const distanceLegs = dist.legs.map((l) => ({ kind: l.kind, km: l.km }));

  // ── 2. ЕТСНГ class ──────────────────────────────────────────────────────────
  const etsng = lookupEtsng(input.etsngCode);
  const tariffClass = etsng?.tariffClass ?? null;
  const etsngName = etsng?.name ?? null;
  if (!etsng) {
    warnings.push(`Код ЕТСНГ ${input.etsngCode} не найден в справочнике.`);
  }

  const wagonCount = input.wagons.reduce((s, w) => s + w.count, 0);

  // ── 3. Scope guard — refuse to price outside the validated contour ──────────
  const outOfScope: string[] = [];
  // International (cross-border) is a DIFFERENT tariff regime, not domestic ТР-1 2026:
  // per-administration segmentation + different VAT. Refuse a domestic price rather than
  // silently return a wrong number — the distance (if it resolves) is still shown.
  const international = isForeignEsr(input.originEsr) || isForeignEsr(input.destEsr);
  if (international)
    outOfScope.push("международная перевозка (станция СНГ/Балтии) — домашний ТР-1 2026 не применим");
  if (input.ownership !== "own")
    outOfScope.push("вагонная составляющая РЖД-парка (В) не считается — только собственный/арендованный");
  if (input.wagonType !== "полувагон")
    outOfScope.push(`тип вагона «${input.wagonType}» вне контура (валидирован только полувагон)`);
  if (tariffClass !== null && tariffClass !== 1)
    outOfScope.push(`класс груза ${tariffClass} вне контура (валидирован класс 1, нерудные)`);
  if (wagonCount < 1) outOfScope.push("не задано число вагонов");

  if (dist.km === null) {
    return {
      scope: outOfScope.length ? "out-of-scope" : "supported",
      confidence: "red",
      distanceKm: null,
      distanceConfidence: dist.confidence,
      distanceLegs,
      tariffClass,
      etsngName,
      perWagon: [],
      wagonCount,
      totalNoVat: null,
      vatRate: VAT_RATE_DOMESTIC,
      totalWithVat: null,
      provision: null,
      provisionRedReason: null,
      warnings: [
        "Расстояние не определено: граф не нашёл тарифного маршрута (нет ребра Книги 3 или станция в карантине).",
        ...outOfScope,
        ...dist.warnings,
        ...warnings,
      ],
    };
  }

  if (outOfScope.length > 0 || tariffClass === null) {
    return {
      scope: "out-of-scope",
      confidence: "red",
      distanceKm: dist.km,
      distanceConfidence: dist.confidence,
      distanceLegs,
      tariffClass,
      etsngName,
      perWagon: [],
      wagonCount,
      totalNoVat: null,
      vatRate: VAT_RATE_DOMESTIC,
      totalWithVat: null,
      provision: null,
      provisionRedReason: null,
      warnings: [
        "Расчёт провозной платы пропущен — параметры вне валидированного до-рубля контура:",
        ...outOfScope,
        ...(tariffClass === null ? ["класс груза не определён (нужен корректный код ЕТСНГ)"] : []),
        "Расстояние посчитано, но цену занесите вручную.",
        ...warnings,
      ],
    };
  }

  // ── 4. N8 own-полувагон class-1 engine ──────────────────────────────────────
  const wagonInputs: N8WagonInput[] = [];
  let n = 0;
  for (const w of input.wagons) {
    for (let i = 0; i < w.count; i++) {
      n += 1;
      wagonInputs.push({
        wagonNo: String(n),
        capacityT: w.capacityT,
        innovative: w.innovative,
      });
    }
  }

  const quote = computeQuoteN8(wagonInputs, loadN8TariffData(), dist.km);
  const perWagon: QuotePerWagon[] = quote.wagons.map((w) => ({
    capacityT: w.capacityT,
    innovative: w.innovative,
    n8: w.n8,
    k1: w.k1,
    k4: w.k4,
    k4Fitted: w.k4Fitted,
    tariffRub: w.tariffRub,
  }));

  const totalNoVat = quote.total;
  const totalWithVat = Math.round(totalNoVat * (1 + VAT_RATE_DOMESTIC / 100));

  // ── 5. Confidence ────────────────────────────────────────────────────────────
  const anyFitted = perWagon.some((w) => w.k4Fitted);
  if (anyFitted)
    warnings.push(
      "K4 на коротком плече использует подогнанную надбавку (источник — две квитанции; правило ещё не верифицировано по тексту п.16.7). Проверьте на средних плечах 511–1000 км.",
    );

  // distance green + validated contour → green; degrade to yellow on a yellow distance.
  const confidence: "green" | "yellow" | "red" =
    dist.confidence === "green" ? "green" : dist.confidence === "yellow" ? "yellow" : "red";

  // ── 6. Предоставление (отдельный блок) — только если задан коэффициент ───────
  // Инвентарная цепочка (0,77 × 0,909 …) выверена только для нерудных класс-1 —
  // считаем её на том же валидированном контуре, что и провозную плату.
  let provision: QuoteProvision | null = null;
  let provisionRedReason: string | null = null;
  if (input.ownerCoeff !== undefined && input.ownerCoeff > 0) {
    const p = computeProvision(input.wagons, input.wagonType, dist.km, input.ownerCoeff);
    provision = p.provision;
    provisionRedReason = p.redReason;
    if (provision) {
      warnings.push(
        "Инвентарный И+В и предоставление — «проверяется»: посчитаны из официальных таблиц, сверены с двумя эталонами R-Тариф, но не выверены до рубля на всех плечах.",
      );
    }
  }

  return {
    scope: "supported",
    confidence,
    distanceKm: dist.km,
    distanceConfidence: dist.confidence,
    distanceLegs,
    tariffClass,
    etsngName,
    perWagon,
    wagonCount,
    totalNoVat,
    vatRate: VAT_RATE_DOMESTIC,
    totalWithVat,
    provision,
    provisionRedReason,
    warnings: [...dist.warnings, ...warnings],
  };
}
