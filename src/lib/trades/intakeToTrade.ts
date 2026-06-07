import { db } from "@/lib/db/client";
import { orders } from "@/lib/db/schema/orders";
import { directions } from "@/lib/db/schema/directions";
import { orderStoneLines } from "@/lib/db/schema/orderStoneLines";
import { resolveCounterpartyId } from "@/lib/counterparties/resolve";
import type { RequestCreateInput, RequestLineInput } from "@/lib/requests/schema";
import { resolveLineComponent } from "./conversionScenario";
import { recacheDealType } from "./repository";

// ── ИИ-распознавание → Сделка напрямую ───────────────────────────────────────
// The AI intake (voice/file/text) extracts route lines; instead of materialising a
// Запрос and converting it, we create a proactive Сделка (orders) and its directions
// in ONE transaction. Mirrors convertRequestToTrade's mapping, but the source is the
// freshly-extracted RequestLineInput (numbers, not a persisted request_line row).
// dealType is auto-derived from the resulting composition (deriveDealType / recache).

// drizzle numeric columns take string | null
function num(v: number | null | undefined): string | null {
  return v != null && Number.isFinite(v) ? String(v) : null;
}

// Map an extracted line → draft direction. Confirmed rates stay NULL; the client's
// desired rate is carried as a SUGGESTION only (rateClientSuggested), never margin (D16/H1).
function directionValues(
  line: RequestLineInput,
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
    stationOriginEsr: line.originEsr ?? null,
    stationDestEsr: line.destEsr ?? null,
    cargoName: line.cargoName ?? null,
    wagonCountPlanned: line.wagonsRequested,
    tonnagePerWagon: num(line.tonnagePerWagon),
    rateClientSuggested: num(line.targetRatePerWagon),
    clientCounterpartyId,
    createdBy: userId,
  };
}

// Map an extracted line → draft stone line. Prices stay NULL (operator-confirmed later).
function stoneValues(
  line: RequestLineInput,
  orderId: string,
  sortOrder: number,
): typeof orderStoneLines.$inferInsert {
  const tonnage =
    line.wagonsRequested != null && line.tonnagePerWagon != null
      ? String(line.wagonsRequested * line.tonnagePerWagon)
      : null;
  return {
    orderId,
    sortOrder,
    locationRaw: line.originRaw,
    locationEsr: line.originEsr ?? null,
    cargoName: line.cargoName ?? "щебень",
    tonnage,
    status: "draft",
  };
}

// Create a proactive deal directly from AI-extracted lines. Reuses requestCreateSchema's
// shape (client + lines) so the IntakeStudio body works unchanged. channel='proactive'.
export async function createTradeFromLines(
  input: RequestCreateInput,
  userId: string,
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    // D16: suggested client only. Explicit id wins; a free-text guess is find-or-created
    // as an advisory 'client' (same idiom as manual deal creation).
    const clientSuggestedId = input.clientSuggestedId
      ? input.clientSuggestedId
      : input.clientRaw
        ? await resolveCounterpartyId(tx, { name: input.clientRaw }, "client")
        : null;

    const first = input.lines[0];
    const title = first ? `${first.originRaw} → ${first.destRaw}` : null;

    const [order] = await tx
      .insert(orders)
      .values({
        title,
        status: "draft",
        channel: "proactive",
        clientSuggestedId,
        notes: input.notes,
        createdBy: userId,
      })
      .returning({ id: orders.id });
    const orderId = order.id;

    let index = 0;
    for (const line of input.lines) {
      const component = resolveLineComponent(
        {
          id: String(index),
          originRaw: line.originRaw,
          destRaw: line.destRaw,
          wagonsRequested: line.wagonsRequested,
        },
        "auto",
      );
      if (component === "transport") {
        await tx.insert(directions).values(directionValues(line, orderId, clientSuggestedId, userId));
      } else {
        await tx.insert(orderStoneLines).values(stoneValues(line, orderId, line.sortOrder ?? index));
      }
      index += 1;
    }

    // deriveDealType is the source of truth — recache from the freshly-inserted composition.
    await recacheDealType(tx, orderId);

    return { id: orderId };
  });
}
