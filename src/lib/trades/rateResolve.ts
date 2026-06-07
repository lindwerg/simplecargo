import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { directionMonthlyRates } from "@/lib/db/schema/directionMonthlyRates";
import { directions } from "@/lib/db/schema/directions";
import { resolvePriceRate } from "@/lib/pricing/lookup";
import { pickRateForMonth, type RateSource, type ResolvedDirectionRate } from "./rateResolve.pure";

// Per-month rate resolution for a Direction (plan §4). Resolution order, most specific
// first, is intentionally layered so a trip always lands on the rate the operator meant:
//
//   1. exact `agreed` row for the report month
//   2. carry-forward: the nearest earlier `agreed` row (a rate stays in force until
//      a newer month supersedes it)
//   3. legacy fallback: directions.rateClient / rateOwner (single-rate directions)
//   4. ПСЦ fallback: resolve a snapshot from the price book (suggestion grade)
//
// Money is never invented: `proposed` rows are ignored (D16/H1) — only `agreed` rows
// resolve. The pure month-picking step lives in ./rateResolve.pure so it stays
// unit-testable without env/Postgres.

export { pickRateForMonth } from "./rateResolve.pure";
export type { MonthlyRateRow, RateSource, ResolvedDirectionRate } from "./rateResolve.pure";

function toNum(v: string | null): number | null {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Resolve the client+owner rate for a direction in a given report month. See the module
// header for the resolution order. The ПСЦ fallback is suggestion-grade and only fills
// in a side that is still null after the layers above.
export async function resolveDirectionRate(
  directionId: string,
  reportMonth: string,
): Promise<ResolvedDirectionRate> {
  // 1–2. Monthly agreed rows + carry-forward (pure picker over the agreed set).
  const monthlyRows = await db
    .select({
      effectiveMonth: directionMonthlyRates.effectiveMonth,
      rateClient: directionMonthlyRates.rateClient,
      rateOwner: directionMonthlyRates.rateOwner,
    })
    .from(directionMonthlyRates)
    .where(
      and(
        eq(directionMonthlyRates.directionId, directionId),
        eq(directionMonthlyRates.status, "agreed"),
      ),
    );

  const picked = pickRateForMonth(monthlyRows, reportMonth);
  if (picked) {
    const rateClient = toNum(picked.row.rateClient);
    const rateOwner = toNum(picked.row.rateOwner);
    if (rateClient !== null || rateOwner !== null) {
      return {
        rateClient,
        rateOwner,
        source: picked.matched === "exact" ? "monthly_exact" : "monthly_carry",
        effectiveMonth: picked.row.effectiveMonth,
      };
    }
  }

  // 3. Legacy single-rate fallback on the direction itself.
  const [dir] = await db
    .select({
      rateClient: directions.rateClient,
      rateOwner: directions.rateOwner,
      stationOriginRaw: directions.stationOriginRaw,
      stationDestRaw: directions.stationDestRaw,
      clientCounterpartyId: directions.clientCounterpartyId,
      ownerCounterpartyId: directions.ownerCounterpartyId,
    })
    .from(directions)
    .where(eq(directions.id, directionId))
    .limit(1);

  if (!dir) {
    return { rateClient: null, rateOwner: null, source: "none", effectiveMonth: null };
  }

  let rateClient = toNum(dir.rateClient);
  let rateOwner = toNum(dir.rateOwner);
  let source: RateSource = rateClient !== null || rateOwner !== null ? "direction_legacy" : "none";

  // 4. ПСЦ price-book fallback for any side still missing (suggestion grade, D16).
  const route =
    dir.stationOriginRaw && dir.stationDestRaw
      ? { originRaw: dir.stationOriginRaw, destRaw: dir.stationDestRaw }
      : null;

  if (route) {
    if (rateClient === null && dir.clientCounterpartyId) {
      const psc = await resolvePriceRate({
        counterpartyId: dir.clientCounterpartyId,
        side: "client_revenue",
        ...route,
        wagonType: "ПВ",
      });
      if (psc) {
        rateClient = psc.rate;
        source = "psc";
      }
    }
    if (rateOwner === null && dir.ownerCounterpartyId) {
      const psc = await resolvePriceRate({
        counterpartyId: dir.ownerCounterpartyId,
        side: "owner_cost",
        ...route,
        wagonType: "ПВ",
      });
      if (psc) {
        rateOwner = psc.rate;
        source = "psc";
      }
    }
  }

  return { rateClient, rateOwner, source, effectiveMonth: null };
}
