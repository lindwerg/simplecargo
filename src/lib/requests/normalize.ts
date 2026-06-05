// PURE, FORMAT-AGNOSTIC cleanup of the AI's extracted result.
//
// DESIGN DECISION (operator-confirmed): the AI ALWAYS does the interpretation —
// forward-fill of blank origin rows, dropping «Итого» totals, reading road codes,
// understanding arbitrary layouts. We do NOT build code parsers/heuristics for
// request structure, because client requests always arrive in different shapes
// (xlsx / screenshot / chat text / voice). The system prompt (prompt.ts) owns all
// of that. This module only does safe, shape-independent hygiene:
//   • trim & nullify empty strings
//   • coerce numbers to safe positive ints/floats (or null)
//   • drop rows the model left wholly empty (no origin AND no dest)
//   • surface a warning when a kept row has no wagon count
// Deterministic, no I/O.

import type { ExtractionResult, ExtractedLine } from "./schema";

function nullifyText(v: string | null): string | null {
  if (v === null) return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function coerceInt(v: number | null): number | null {
  if (v === null || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n > 0 ? n : null;
}

function coercePositive(v: number | null): number | null {
  if (v === null || !Number.isFinite(v) || v <= 0) return null;
  return v;
}

export function normalizeExtraction(raw: ExtractionResult): ExtractionResult {
  const warnings: string[] = [...(raw.warnings ?? [])];
  const lines: ExtractedLine[] = [];

  for (const line of raw.lines ?? []) {
    const originRaw = nullifyText(line.originRaw);
    const destRaw = nullifyText(line.destRaw);

    // drop rows the model returned with no route at all (pure garbage)
    if (!originRaw && !destRaw) continue;

    const wagons = coerceInt(line.wagonsRequested);
    if (wagons === null) {
      warnings.push(`Строка ${originRaw ?? "?"} → ${destRaw ?? "?"}: не указано число вагонов`);
    }

    lines.push({
      originRaw,
      originRoadRaw: nullifyText(line.originRoadRaw),
      destRaw,
      destRoadRaw: nullifyText(line.destRoadRaw),
      cargoName: nullifyText(line.cargoName),
      etsngCode: nullifyText(line.etsngCode),
      wagonsRequested: wagons,
      tonnagePerWagon: coercePositive(line.tonnagePerWagon),
      targetRatePerWagon: coercePositive(line.targetRatePerWagon),
      targetRateRaw: nullifyText(line.targetRateRaw),
    });
  }

  return {
    clientGuess: nullifyText(raw.clientGuess),
    wagonType: nullifyText(raw.wagonType),
    periodFrom: nullifyText(raw.periodFrom),
    periodTo: nullifyText(raw.periodTo),
    lines,
    warnings,
  };
}
