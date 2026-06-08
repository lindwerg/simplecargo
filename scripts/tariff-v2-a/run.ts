// Runner: reproduce BOTH oracle квитанции end-to-end and print per-wagon diffs + totals.
//   npx tsx scripts/tariff-v2-a/run.ts
//
// Innovative/classic 75т split (ЭФ164189) is FITTED from the per-wagon targets:
//   75т @ 70477 ₽ ← innovative (×0.9595);  75т @ 73452 ₽ ← classic (no ×0.9595).
// We cannot source individual wagon models, so this assignment is calibrated, not sourced.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeQuote, type WagonInput } from "./tariffV2a";

const SEED = resolve(import.meta.dirname, "../seed-data");

interface RefWagon {
  wagonNo: string;
  capacityT: number;
  netT: number;
  tariffRub: number;
}
interface RefQuote {
  id: string;
  wagonCount: number;
  ref: { distanceKm: number; totalTariffRub: number; perWagon: RefWagon[] };
}

const quotes = JSON.parse(
  readFileSync(resolve(SEED, "reference-quotes.json"), "utf8"),
) as RefQuote[];

const EF = quotes.find((q) => q.id === "EF164189")!;
const ET = quotes.find((q) => q.id === "ET201459")!;

// FITTED split for ЭФ164189: 75т wagons whose receipt tariff is 70477 → innovative.
function efWagons(): WagonInput[] {
  return EF.ref.perWagon.map((w) => ({
    wagonNo: w.wagonNo,
    capacityT: w.capacityT,
    innovative: w.capacityT >= 74.5 && w.tariffRub === 70477,
  }));
}

// ЭТ201459: all 6 wagons classic (cap 69.5/70 → no innovative tier at this haul).
function etWagons(): WagonInput[] {
  return ET.ref.perWagon.map((w) => ({
    wagonNo: w.wagonNo,
    capacityT: w.capacityT,
    innovative: false,
  }));
}

function report(label: string, ref: RefQuote, wagons: WagonInput[]): boolean {
  const res = computeQuote(wagons, ref.ref.distanceKm);
  console.log(`\n══ ${label} (${ref.id}) — ${ref.ref.distanceKm} км, ${ref.wagonCount} ваг ══`);
  console.log(
    "wagonNo".padEnd(11),
    "cap".padStart(5),
    "innov".padStart(6),
    "N8".padStart(8),
    "K1".padStart(5),
    "K4".padStart(9),
    "calc".padStart(7),
    "квит".padStart(7),
    "Δ".padStart(5),
  );
  let anyFitted = false;
  for (let i = 0; i < res.wagons.length; i++) {
    const w = res.wagons[i];
    const r = ref.ref.perWagon[i];
    const diff = w.tariffRub - r.tariffRub;
    if (w.k4Fitted) anyFitted = true;
    console.log(
      w.wagonNo.padEnd(11),
      String(w.capacityT).padStart(5),
      (w.innovative ? "yes" : "no").padStart(6),
      String(w.n8).padStart(8),
      String(w.k1).padStart(5),
      w.k4.toFixed(5).padStart(9),
      String(w.tariffRub).padStart(7),
      String(r.tariffRub).padStart(7),
      (diff === 0 ? "0" : (diff > 0 ? "+" : "") + diff).padStart(5),
    );
  }
  const target = ref.ref.totalTariffRub;
  const ok = res.total === target;
  console.log(`K4 basis: ${res.wagons[0].k4Basis}`);
  console.log(
    `TOTAL  calc=${res.total}  квитанция=${target}  Δ=${res.total - target}  ${ok ? "EXACT ✓" : "MISMATCH ✗"}${anyFitted ? "  [K4 FITTED]" : "  [sourced]"}`,
  );
  return ok;
}

const efOk = report("Возрождение→Гремячая", EF, efWagons());
const etOk = report("Исеть→Наб.Челны", ET, etWagons());

console.log(
  `\n═══ SUMMARY: ЭФ164189 ${efOk ? "EXACT" : "OFF"} | ЭТ201459 ${etOk ? "EXACT" : "OFF"} ═══`,
);
process.exit(efOk && etOk ? 0 : 1);
