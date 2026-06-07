import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { orders } from "@/lib/db/schema/orders";
import { directions } from "@/lib/db/schema/directions";
import { orderStoneLines } from "@/lib/db/schema/orderStoneLines";
import { counterparties } from "@/lib/db/schema/counterparties";
import { resolveCounterpartyId } from "@/lib/counterparties/resolve";
import { deriveDealType } from "./derive";
import type { CreateTradeInput } from "./schema";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Domain error mapped to an HTTP status by the route handlers (parallel to DirectionError).
export class TradeError extends Error {
  constructor(
    public readonly status: 404 | 409 | 422,
    message: string,
  ) {
    super(message);
    this.name = "TradeError";
  }
}

export interface TradeSummary {
  id: string;
  orderNumber: string | null;
  title: string | null;
  status: string;
  dealType: string | null;
  channel: string;
  requestId: string | null;
  reportMonth: string | null;
  notes: string | null;
  clientSuggestedId: string | null;
  clientName: string | null;
  createdAt: Date;
  directionCount: number;
}

// Create a proactive deal (channel='proactive', status='draft'). The suggested client
// is advisory (D16) and find-or-created inline when given by name. dealType stays NULL
// until the first component is attached (deriveDealType).
export async function createTrade(
  input: CreateTradeInput,
  userId: string,
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const clientSuggestedId = input.client
      ? await resolveCounterpartyId(tx, input.client, "client")
      : null;

    const inserted = await tx
      .insert(orders)
      .values({
        title: input.title,
        orderNumber: input.orderNumber,
        status: "draft",
        channel: "proactive",
        clientSuggestedId,
        reportMonth: input.reportMonth,
        notes: input.notes,
        createdBy: userId,
      })
      .returning({ id: orders.id });

    return { id: inserted[0].id };
  });
}

export async function getTrade(id: string): Promise<TradeSummary | null> {
  const [row] = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      title: orders.title,
      status: orders.status,
      dealType: orders.dealType,
      channel: orders.channel,
      requestId: orders.requestId,
      reportMonth: orders.reportMonth,
      notes: orders.notes,
      clientSuggestedId: orders.clientSuggestedId,
      clientName: counterparties.nameCanonical,
      createdAt: orders.createdAt,
      directionCount: sql<number>`(
        SELECT count(*)::int FROM ${directions} WHERE ${directions.orderId} = ${orders.id}
      )`,
    })
    .from(orders)
    .leftJoin(counterparties, eq(orders.clientSuggestedId, counterparties.id))
    .where(eq(orders.id, id))
    .limit(1);

  return row ?? null;
}

export async function listTrades(): Promise<TradeSummary[]> {
  return db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      title: orders.title,
      status: orders.status,
      dealType: orders.dealType,
      channel: orders.channel,
      requestId: orders.requestId,
      reportMonth: orders.reportMonth,
      notes: orders.notes,
      clientSuggestedId: orders.clientSuggestedId,
      clientName: counterparties.nameCanonical,
      createdAt: orders.createdAt,
      directionCount: sql<number>`(
        SELECT count(*)::int FROM ${directions} WHERE ${directions.orderId} = ${orders.id}
      )`,
    })
    .from(orders)
    .leftJoin(counterparties, eq(orders.clientSuggestedId, counterparties.id))
    .orderBy(desc(orders.createdAt));
}

// Re-cache orders.deal_type from the deal's current composition: transport directions
// AND stone lines (Фаза 2). Kept in its own helper so the dealType cache stays one call
// away from any mutation on either component. Exported so stoneRepository reuses it.
export async function recacheDealType(tx: Tx, orderId: string): Promise<void> {
  const [{ dirCount }] = await tx
    .select({ dirCount: sql<number>`count(*)::int` })
    .from(directions)
    .where(eq(directions.orderId, orderId));
  const [{ stoneCount }] = await tx
    .select({ stoneCount: sql<number>`count(*)::int` })
    .from(orderStoneLines)
    .where(eq(orderStoneLines.orderId, orderId));
  const next = deriveDealType(stoneCount > 0, dirCount > 0);
  await tx.update(orders).set({ dealType: next, updatedAt: new Date() }).where(eq(orders.id, orderId));
}

// Attach an existing direction to a deal and refresh the dealType cache in one tx.
export async function addDirectionToTrade(
  orderId: string,
  directionId: string,
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const [deal] = await tx.select({ id: orders.id }).from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!deal) throw new TradeError(404, "Сделка не найдена");

    const updated = await tx
      .update(directions)
      .set({ orderId, updatedAt: new Date() })
      .where(and(eq(directions.id, directionId), sql`${directions.orderId} IS DISTINCT FROM ${orderId}`))
      .returning({ id: directions.id });

    if (!updated[0]) {
      // Either the direction does not exist or it is already attached to this deal.
      const [exists] = await tx
        .select({ id: directions.id })
        .from(directions)
        .where(eq(directions.id, directionId))
        .limit(1);
      if (!exists) throw new TradeError(404, "Направление не найдено");
    }

    await recacheDealType(tx, orderId);
    return { id: directionId };
  });
}

// Refresh the dealType cache for a deal (called after direction create/delete elsewhere).
export async function refreshTradeDealType(orderId: string): Promise<void> {
  await db.transaction((tx) => recacheDealType(tx, orderId));
}
