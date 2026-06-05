import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { priceProtocolRates, priceProtocols } from "@/lib/db/schema/pricing";
import { selectApplicableRate } from "./resolve";
import type { ResolveRateCriteria, ResolvedRate } from "./resolve";

export type { ResolveRateCriteria, ResolvedRate } from "./resolve";

// Direction-facing snapshot lookup (P15-2 acceptance "direction can look up snapshot
// rate"). Fetches route-matched candidates, then delegates the choice to the pure
// selector (./resolve). Exact match on raw strings; road-level fallback matching is P15-3.
export async function resolvePriceRate(criteria: ResolveRateCriteria): Promise<ResolvedRate | null> {
  const rows = await db
    .select({
      protocolId: priceProtocolRates.protocolId,
      rate: priceProtocolRates.rate,
      status: priceProtocols.status,
      validFrom: priceProtocols.validFrom,
      protocolDate: priceProtocols.protocolDate,
    })
    .from(priceProtocolRates)
    .innerJoin(priceProtocols, eq(priceProtocolRates.protocolId, priceProtocols.id))
    .where(
      and(
        eq(priceProtocols.counterpartyId, criteria.counterpartyId),
        eq(priceProtocols.side, criteria.side),
        eq(priceProtocolRates.originRaw, criteria.originRaw),
        eq(priceProtocolRates.destRaw, criteria.destRaw),
        eq(priceProtocolRates.wagonType, criteria.wagonType),
      ),
    );

  const applicable = selectApplicableRate(rows, criteria.onDate ? { onDate: criteria.onDate } : {});
  if (!applicable) return null;
  return { protocolId: applicable.protocolId, rate: Number(applicable.rate) };
}
