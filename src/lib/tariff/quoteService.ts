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
import { loadEtsngFromSeed } from "@/lib/tariff/seedLoader";
import {
  computeQuoteN8,
  type N8WagonInput,
} from "@/lib/tariff/computeTariffN8";
import { loadN8TariffData } from "@/lib/tariff/n8Data";

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
  readonly warnings: readonly string[];
}

function lookupEtsng(
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
      warnings: [
        "Расстояние не определено: граф не нашёл тарифного маршрута (нет ребра Книги 3 или станция в карантине).",
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
    warnings: [...dist.warnings, ...warnings],
  };
}
