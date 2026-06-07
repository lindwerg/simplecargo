import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { orders } from "@/lib/db/schema/orders";
import { directions } from "@/lib/db/schema/directions";
import { orderStoneLines } from "@/lib/db/schema/orderStoneLines";
import { requestLines, requests } from "@/lib/db/schema/requests";
import { deriveDealType } from "./derive";
import { recacheDealType, TradeError, type Tx } from "./repository";
import { effectiveChoice, resolveLineComponent, type ConvertScenario } from "./conversionScenario";

export type { ConvertScenario, LineComponent } from "./conversionScenario";

// ── Conversion: Запрос → Сделка (Фаза 3) ─────────────────────────────────────
// Turns a won RFQ into a deal (orders) in ONE transaction:
//   1. guard against re-conversion (requests.converted_order_id already set → 409;
//      a unique partial index on orders.request_id is the second barrier);
//   2. create orders (channel='inbound', request_id, client_suggested_id ← request,
//      status='draft');
//   3. per request_line, create a direction and/or a stone line by scenario
//      (rates land ONLY in *_suggested — D16/H1, money is never auto-confirmed);
//   4. close the FK loop both ways (requests.converted_order_id ↔ orders.request_id);
//   5. recache deal_type from the resulting composition.

type RequestLineRow = typeof requestLines.$inferSelect;

// Map a request_line to a draft direction. Confirmed rates stay NULL; the client's
// desired rate is carried as a SUGGESTION only (rateClientSuggested), never margin.
function directionValues(
  line: RequestLineRow,
  orderId: string,
  clientCounterpartyId: string | null,
  userId: string,
): typeof directions.$inferInsert {
  return {
    orderId,
    displayName: `${line.originRaw} → ${line.destRaw}`,
    status: "draft",
    statusChangedBy: userId,
    stationOriginRaw: line.originRaw,
    stationDestRaw: line.destRaw,
    stationOriginEsr: line.originEsr,
    stationDestEsr: line.destEsr,
    cargoName: line.cargoName,
    wagonCountPlanned: line.wagonsRequested,
    tonnagePerWagon: line.tonnagePerWagon,
    // D16/H1: the client's desired rate is advisory only — never a confirmed number.
    rateClientSuggested: line.targetRatePerWagon,
    clientCounterpartyId,
    createdBy: userId,
  };
}

// Map a request_line to a draft stone line. Prices stay NULL (operator-confirmed later).
function stoneValues(line: RequestLineRow, orderId: string): typeof orderStoneLines.$inferInsert {
  const tonnage =
    line.wagonsRequested != null && line.tonnagePerWagon != null
      ? String(line.wagonsRequested * Number(line.tonnagePerWagon))
      : null;
  return {
    orderId,
    sortOrder: line.sortOrder,
    locationRaw: line.originRaw,
    locationEsr: line.originEsr,
    cargoName: line.cargoName ?? "щебень",
    tonnage,
    status: "draft",
  };
}

async function loadConvertibleRequest(tx: Tx, requestId: string) {
  const rows = await tx.select().from(requests).where(eq(requests.id, requestId)).limit(1);
  const request = rows[0];
  if (!request) throw new TradeError(404, "Запрос не найден");
  if (request.convertedOrderId) {
    throw new TradeError(409, "Запрос уже сконвертирован в сделку");
  }
  return request;
}

export async function convertRequestToTrade(
  requestId: string,
  scenario: ConvertScenario,
  userId: string,
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const request = await loadConvertibleRequest(tx, requestId);

    const lines = await tx
      .select()
      .from(requestLines)
      .where(eq(requestLines.requestId, requestId));

    // D16: the request's suggested client carries over as a SUGGESTION on the deal;
    // the confirmed client is still set per-direction downstream.
    const clientSuggestedId = request.clientSuggestedId ?? null;

    const [order] = await tx
      .insert(orders)
      .values({
        channel: "inbound",
        status: "draft",
        requestId,
        clientSuggestedId,
        createdBy: userId,
      })
      .returning({ id: orders.id });
    const orderId = order.id;

    let hasTransport = false;
    let hasStone = false;

    for (const line of lines) {
      const choice = effectiveChoice(scenario, line.id);
      const component = resolveLineComponent(line, choice);
      if (component === "transport") {
        await tx.insert(directions).values(directionValues(line, orderId, clientSuggestedId, userId));
        hasTransport = true;
      } else {
        await tx.insert(orderStoneLines).values(stoneValues(line, orderId));
        hasStone = true;
      }
    }

    // Close the FK loop both ways. The partial unique index on orders.request_id is the
    // second barrier against a race that slips past the converted_order_id guard above.
    await tx
      .update(requests)
      .set({ convertedOrderId: orderId, updatedAt: new Date() })
      .where(eq(requests.id, requestId));

    // Recache deal_type. deriveDealType is the source of truth; recacheDealType re-reads
    // the freshly-inserted composition to stay consistent with the stored counts.
    await tx
      .update(orders)
      .set({ dealType: deriveDealType(hasStone, hasTransport), updatedAt: new Date() })
      .where(eq(orders.id, orderId));
    await recacheDealType(tx, orderId);

    return { id: orderId };
  });
}
