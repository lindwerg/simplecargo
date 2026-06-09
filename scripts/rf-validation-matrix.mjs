// ─────────────────────────────────────────────────────────────────────────────
// rf-validation-matrix.mjs — MASS R-Тариф validation matrix generator (RUSSIA only).
//
// Goal: turn "до конца РФ" into a checkable batch. Generates a broad spread of RF
// origin→dest routes (across дороги, distance bands, узлы) × representative cargoes
// (нерудные class-1, class-2 жб/удобрения, class-3 metal) × wagon types
// (ПВ / платформа ПЛ / цистерна ЦС), runs OUR engine
// (resolveDistance ТР-4 + the N8 own-полувагон / inventory общий-парк tariff path),
// and writes scripts/seed-data/rf-validation-matrix.json with one row per
// {route, cargo, wagon} carrying {ourKm, ourProvNoVat, confidence, …}.
//
// NO FABRICATION. Every km comes from the ТР-4 graph engine; every ₽ comes from a
// verbatim ТР-1 table via the certified engine functions. Where the engine cannot
// produce a number (цистерна / 1D-схема not pinned) the row is RED with provNoVat=null
// and an explicit reason — never a plausible substitute.
//
// Confidence model (matches the project's green/yellow/red):
//   • green  — own-ПВ class-1 N8 path (oracle-certified to the kopeck). provNoVat = own tariff.
//   • yellow — inventory (общий парк) ПВ/ПЛ via computeInventory: computed per official
//              table but NOT yet R-Тариф-certified at THAT route/cargo point. provNoVat =
//              inventory(И+В) × ownerCoeff. These are the rows the operator must batch-verify.
//   • red    — engine returns no number (цистерна ЦС 1D-схема / коэффициент рода не закреплён).
//
// Run:  npx tsx scripts/rf-validation-matrix.mjs
//       npx tsx scripts/rf-validation-matrix.mjs --all-routes   (full 56 directed pairs × grid)
//
// Output is consumed by the operator per docs/planning/RF_VALIDATION_BATCH.md.
// ─────────────────────────────────────────────────────────────────────────────

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { resolveDistance } from "@/lib/distance/repository";
import { isForeignEsr } from "@/lib/distance/foreignStations";
import { lookupEtsng, VAT_RATE_DOMESTIC } from "@/lib/tariff/quoteService";
import { computeWagonN8 } from "@/lib/tariff/computeTariffN8";
import { loadN8TariffData } from "@/lib/tariff/n8Data";
import { computeInventory } from "@/lib/tariff/computeInventory";
import { loadInventoryTariffData } from "@/lib/tariff/inventoryData";

const OUT_FILE = resolve(process.cwd(), "scripts/seed-data/rf-validation-matrix.json");

// Owner coefficient applied to the inventory (общий-парк) tariff to derive ставка
// предоставления (the operator's column). Same default as the «Калькулятор» matrix
// (DEFAULT_OWNER_COEFF). The operator edits this in R-Тариф checks if their coef differs.
const OWNER_COEFF = 1.15;

// Representative shipment for the matrix: групповая 6 wagons → K4 group "6-20".
// One representative count keeps the batch checkable; the K4 lever itself is already
// triangulated by the rtariff-validation.template.json fitted cases.
const WAGON_COUNT = 6;

function withVat(amount) {
  return Math.round(amount * (1 + VAT_RATE_DOMESTIC / 100));
}

// ── RF station pool ────────────────────────────────────────────────────────────
// The 8 stations below ALL resolve green pairwise on the ТР-4 backbone graph (verified:
// 56/56 directed pairs green, spanning every distance band). They cover 6 дороги
// (Окт, Прив, Сверд, Кбш, СКВ, Смол). These are the only RF anchors currently attached
// to the kniga3 backbone / transit-attach legs — adding un-attached ESRs would just yield
// RED distances, so the pool is intentionally the proven-reachable set (no fabrication).
const STATIONS = {
  "021609": { name: "Возрождение", road: "Окт" },
  "612709": { name: "Гремячая", road: "Прив" },
  "771500": { name: "Исеть", road: "Сверд" },
  "648503": { name: "Набережные Челны", road: "Кбш" },
  "023202": { name: "Элисенваара", road: "Окт" },
  "528706": { name: "Элиста", road: "СКВ" },
  "171401": { name: "Красное", road: "Смол" },
  "172008": { name: "Рудня", road: "Смол" },
};

// Curated route spread: one+ representative pair per distance band, across дороги and
// the Moscow/СПб узел region. Each is green on the engine. --all-routes expands to all
// 56 directed pairs (full pairwise sweep).
const CURATED_ROUTES = [
  ["171401", "172008"], // ~150 km   <=510   (Смол→Смол, ultra-short)
  ["771500", "648503"], // ~699 km   511-1000 (Сверд→Кбш) — oracle ЭТ201459
  ["021609", "171401"], // ~1359 km  1001-2000 (Окт→Смол, узел Moscow region)
  ["612709", "648503"], // ~1708 km  1001-2000 (Прив→Кбш)
  ["021609", "648503"], // ~1944 km  1001-2000 (Окт→Кбш)
  ["771500", "612709"], // ~2177 km  2001-2600 (Сверд→Прив)
  ["771500", "023202"], // ~2296 km  2001-2600 (Сверд→Окт/Northwest узел)
  ["021609", "612709"], // ~2444 km  2001-2600 (Окт→Прив) — oracle ЭФ164189
  ["528706", "771500"], // ~3012 km  >2600   (СКВ→Сверд)
  ["021609", "528706"], // ~3069 km  >2600   (Окт→СКВ, crosses Moscow узел)
  ["023202", "528706"], // ~3108 km  >2600   (Окт→СКВ) — R-Тариф мрамор oracle
];

// ── Cargo × wagon grid ──────────────────────────────────────────────────────────
// Representative cargoes spanning all three freight classes, paired with the three
// wagon types the task names. ETSNG codes are real and resolve in the catalog
// (verified). The class shown is the catalog's class for that code.
const CARGOES = [
  { etsng: "232395", label: "Щебень гранитный", class: 1 }, // нерудный class-1
  { etsng: "078005", label: "Удобрения органические", class: 2 }, // class-2
  { etsng: "316001", label: "Лом черных металлов", class: 3 }, // class-3 metal
];

// Wagon types. ПВ полувагон + ПЛ платформа are universal (inventory yellow-capable);
// ЦС цистерна uses a 1D-схема whose number is NOT pinned → engine returns RED (honest).
const WAGONS = [
  { code: "ПВ", label: "Полувагон", capacityT: 70 },
  { code: "ПЛ", label: "Платформа", capacityT: 60 },
  { code: "ЦС", label: "Цистерна", capacityT: 60 },
];

// ── Per-cell engine run ───────────────────────────────────────────────────────
//
// Routing of the price path (no fabrication):
//   • own ПВ + class-1  → computeWagonN8 (own-полувагон oracle-certified path) → GREEN.
//       provNoVat = own tariff (no owner coef — собственный парк IS the price).
//   • ПВ/ПЛ any class    → computeInventory (общий-парк И+В, class-correct K1) → YELLOW.
//       provNoVat = inventory(И+В) × OWNER_COEFF  (ставка предоставления).
//   • ЦС / unsupported   → computeInventory returns red → RED, provNoVat = null + reason.
function priceCell(n8Data, invData, wagon, cargo, distKm) {
  // GREEN: the single oracle-certified path — own полувагон, class 1.
  if (wagon.code === "ПВ" && cargo.class === 1) {
    const w = computeWagonN8(
      { wagonNo: "1", capacityT: wagon.capacityT, innovative: false },
      n8Data,
      distKm,
      WAGON_COUNT,
    );
    return {
      pricePath: "own-ПВ-N8 (oracle-certified)",
      ownNoVat: w.tariffRub,
      ownWithVat: withVat(w.tariffRub),
      provNoVat: w.tariffRub,
      provWithVat: withVat(w.tariffRub),
      k4Fitted: w.k4Fitted,
      confidence: "green",
      redReason: null,
    };
  }

  // YELLOW / RED: inventory (общий-парк) path. Handles ПВ/ПЛ (yellow) and refuses
  // цистерна/крытый 1D-схемы (red) honestly via computeInventory's own guard.
  const inv = computeInventory(wagon.code, wagon.capacityT, distKm, WAGON_COUNT, invData);
  if (inv.confidence === "red" || inv.inventoryNoVat === null) {
    return {
      pricePath: `inventory-${wagon.code} (отказ движка)`,
      ownNoVat: null,
      ownWithVat: null,
      provNoVat: null,
      provWithVat: null,
      k4Fitted: false,
      confidence: "red",
      redReason: inv.redReason,
    };
  }

  const provNoVat = Math.round(inv.inventoryNoVat * OWNER_COEFF);
  return {
    pricePath: `inventory-${wagon.code} И+В × ${OWNER_COEFF} (общий парк, проверяется)`,
    ownNoVat: inv.inventoryNoVat,
    ownWithVat: withVat(inv.inventoryNoVat),
    provNoVat,
    provWithVat: withVat(provNoVat),
    k4Fitted: false,
    confidence: "yellow",
    redReason: null,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const allRoutes = args.includes("--all-routes");

  const n8Data = loadN8TariffData();
  const invData = loadInventoryTariffData();

  // Build the route list (curated by default, full pairwise with --all-routes).
  let routePairs = CURATED_ROUTES;
  if (allRoutes) {
    const esrs = Object.keys(STATIONS);
    routePairs = [];
    for (const o of esrs) for (const d of esrs) if (o !== d) routePairs.push([o, d]);
  }

  const rows = [];
  const tally = { green: 0, yellow: 0, red: 0 };
  const bandSet = new Set();
  const roadSet = new Set();
  let resolvedRoutes = 0;
  let skippedForeign = 0;
  let skippedRed = 0;

  for (const [originEsr, destEsr] of routePairs) {
    // RF-only scope guard: refuse any route touching a foreign (CIS/Baltic) station.
    if (isForeignEsr(originEsr) || isForeignEsr(destEsr)) {
      skippedForeign += 1;
      continue;
    }

    const dist = await resolveDistance({ originEsr, destEsr, emptyRun: false });
    if (dist.km === null) {
      // Honest: a route the graph cannot resolve produces no rows (never a guessed km).
      skippedRed += 1;
      continue;
    }
    resolvedRoutes += 1;

    const oSt = STATIONS[originEsr] ?? { name: originEsr, road: "?" };
    const dSt = STATIONS[destEsr] ?? { name: destEsr, road: "?" };
    roadSet.add(oSt.road);
    roadSet.add(dSt.road);

    const band =
      dist.km <= 510 ? "<=510" :
      dist.km <= 1000 ? "511-1000" :
      dist.km <= 2000 ? "1001-2000" :
      dist.km <= 2600 ? "2001-2600" : ">2600";
    bandSet.add(band);

    for (const cargo of CARGOES) {
      const etsng = lookupEtsng(cargo.etsng);
      const tariffClass = etsng?.tariffClass ?? cargo.class;
      for (const wagon of WAGONS) {
        const cell = priceCell(n8Data, invData, wagon, { ...cargo, class: tariffClass }, dist.km);
        tally[cell.confidence] += 1;
        rows.push({
          route: {
            originEsr,
            originName: oSt.name,
            originRoad: oSt.road,
            destEsr,
            destName: dSt.name,
            destRoad: dSt.road,
            band,
          },
          cargo: {
            etsng: cargo.etsng,
            name: etsng?.name ?? cargo.label,
            freightClass: tariffClass,
          },
          wagon: { code: wagon.code, label: wagon.label, capacityT: wagon.capacityT },
          ownership: wagon.code === "ПВ" && tariffClass === 1 ? "own" : "rzd-inventory",
          shipment: { type: "group", wagonCount: WAGON_COUNT },
          ownerCoeff: OWNER_COEFF,
          ourKm: dist.km,
          ourKmConfidence: dist.confidence,
          ownNoVat: cell.ownNoVat,
          ownWithVat: cell.ownWithVat,
          ourProvNoVat: cell.provNoVat,
          ourProvWithVat: cell.provWithVat,
          k4Fitted: cell.k4Fitted,
          confidence: cell.confidence,
          pricePath: cell.pricePath,
          redReason: cell.redReason,
          // Operator pastes R-Тариф reference here to flag диффы (see RF_VALIDATION_BATCH.md).
          ref_provoznayaNoVat: null,
          ref_distanceKm: null,
          ref_notes: "",
        });
      }
    }
  }

  const out = {
    _meta: {
      dataset: "RF mass R-Тариф validation matrix",
      generatedAt: new Date().toISOString(),
      scope: "RUSSIA only (CIS/foreign explicitly excluded — flagged, not priced)",
      vatRateDomesticPct: VAT_RATE_DOMESTIC,
      ownerCoeff: OWNER_COEFF,
      wagonCount: WAGON_COUNT,
      shipment: "групповая (group), 6 wagons → K4 group '6-20'",
      confidenceModel: {
        green: "own-ПВ class-1 N8 path — oracle-certified до копейки. ourProvNoVat = own tariff.",
        yellow: "inventory (общий парк) ПВ/ПЛ via computeInventory — computed per official ТР-1 table but NOT yet R-Тариф-certified at this route/cargo. ourProvNoVat = inventory(И+В) × ownerCoeff. These rows need operator batch-verification.",
        red: "engine returns no number (цистерна ЦС 1D-схема / коэффициент рода не закреплён). ourProvNoVat = null + redReason. Operator collects the R-Тариф reference to build the scheme next.",
      },
      noFabrication:
        "Every ourKm is from the ТР-4 graph engine; every ourProvNoVat is from a verbatim ТР-1 table via the certified engine functions. RED rows carry no number.",
      coverage: {
        routesResolved: resolvedRoutes,
        cargoes: CARGOES.length,
        wagonTypes: WAGONS.length,
        rowsPerRoute: CARGOES.length * WAGONS.length,
        totalRows: rows.length,
        distanceBands: [...bandSet].sort(),
        roads: [...roadSet].sort(),
        skippedForeignRoutes: skippedForeign,
        skippedUnresolvedRoutes: skippedRed,
        verdictTally: tally,
      },
      howToVerify: "docs/planning/RF_VALIDATION_BATCH.md",
    },
    rows,
  };

  writeFileSync(OUT_FILE, JSON.stringify(out), "utf8");

  console.log(
    JSON.stringify(
      {
        wrote: OUT_FILE,
        routesResolved: resolvedRoutes,
        cargoes: CARGOES.length,
        wagonTypes: WAGONS.length,
        totalRows: rows.length,
        bands: [...bandSet].sort(),
        roads: [...roadSet].sort(),
        verdictTally: tally,
        skippedForeign,
        skippedUnresolved: skippedRed,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error("rf-validation-matrix failed:", err);
  process.exit(1);
});
