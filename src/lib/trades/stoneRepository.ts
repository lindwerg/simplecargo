import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { orders } from "@/lib/db/schema/orders";
import { orderStoneLines } from "@/lib/db/schema/orderStoneLines";
import { counterparties } from "@/lib/db/schema/counterparties";
import { resolveCounterpartyId } from "@/lib/counterparties/resolve";
import { TradeError, recacheDealType, type Tx } from "./repository";
import type { CreateStoneLineInput, UpdateStoneLineInput } from "./stoneSchema";

// A stone line read for the deal card. marginPerTon is the generated STORED column.
export interface StoneLineRow {
  id: string;
  orderId: string;
  sortOrder: number;
  quarrySupplierId: string | null;
  quarryName: string | null;
  quarryRaw: string | null;
  locationEsr: string | null;
  locationRaw: string | null;
  fraction: string | null;
  cargoName: string;
  tonnage: string | null;
  tonnageActual: string | null;
  pricePurchase: string | null;
  priceSale: string | null;
  marginPerTon: string | null;
  currency: string;
  reportMonth: string | null;
  status: string;
}

const baseSelect = {
  id: orderStoneLines.id,
  orderId: orderStoneLines.orderId,
  sortOrder: orderStoneLines.sortOrder,
  quarrySupplierId: orderStoneLines.quarrySupplierId,
  quarryName: counterparties.nameCanonical,
  quarryRaw: orderStoneLines.quarryRaw,
  locationEsr: orderStoneLines.locationEsr,
  locationRaw: orderStoneLines.locationRaw,
  fraction: orderStoneLines.fraction,
  cargoName: orderStoneLines.cargoName,
  tonnage: orderStoneLines.tonnage,
  tonnageActual: orderStoneLines.tonnageActual,
  pricePurchase: orderStoneLines.pricePurchase,
  priceSale: orderStoneLines.priceSale,
  marginPerTon: orderStoneLines.marginPerTon,
  currency: orderStoneLines.currency,
  reportMonth: orderStoneLines.reportMonth,
  status: orderStoneLines.status,
} as const;

// List stone lines for a deal, oldest sort_order first (then creation order).
export async function listStoneLines(orderId: string): Promise<StoneLineRow[]> {
  return db
    .select(baseSelect)
    .from(orderStoneLines)
    .leftJoin(counterparties, eq(orderStoneLines.quarrySupplierId, counterparties.id))
    .where(eq(orderStoneLines.orderId, orderId))
    .orderBy(asc(orderStoneLines.sortOrder), asc(orderStoneLines.createdAt));
}

// Map a validated input to the columns it sets. quarry is resolved separately (needs tx).
function lineValues(
  input: CreateStoneLineInput | UpdateStoneLineInput,
): Record<string, unknown> {
  const v: Record<string, unknown> = {};
  if ("quarryRaw" in input) v.quarryRaw = input.quarryRaw ?? null;
  if ("locationRaw" in input) v.locationRaw = input.locationRaw ?? null;
  if ("locationEsr" in input) v.locationEsr = input.locationEsr ?? null;
  if ("fraction" in input) v.fraction = input.fraction ?? null;
  if ("cargoName" in input && input.cargoName) v.cargoName = input.cargoName;
  if ("tonnage" in input) v.tonnage = input.tonnage ?? null;
  if ("tonnageActual" in input) v.tonnageActual = input.tonnageActual ?? null;
  if ("pricePurchase" in input) v.pricePurchase = input.pricePurchase ?? null;
  if ("priceSale" in input) v.priceSale = input.priceSale ?? null;
  if ("currency" in input && input.currency) v.currency = input.currency;
  if ("reportMonth" in input) v.reportMonth = input.reportMonth ?? null;
  if ("sortOrder" in input && input.sortOrder !== undefined) v.sortOrder = input.sortOrder;
  if ("status" in input && input.status) v.status = input.status;
  return v;
}

// Resolve the quarry supplier (find-or-create with role 'quarry') when an input is given.
async function resolveQuarry(
  tx: Tx,
  input: CreateStoneLineInput | UpdateStoneLineInput,
): Promise<string | null | undefined> {
  if (!("quarry" in input) || input.quarry === undefined) return undefined;
  return resolveCounterpartyId(tx, input.quarry, "quarry");
}

// Add a stone line to a deal and refresh the dealType cache in one transaction.
export async function addStoneLine(
  orderId: string,
  input: CreateStoneLineInput,
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const [deal] = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!deal) throw new TradeError(404, "Сделка не найдена");

    const quarrySupplierId = await resolveQuarry(tx, input);
    const inserted = await tx
      .insert(orderStoneLines)
      .values({
        orderId,
        ...lineValues(input),
        ...(quarrySupplierId !== undefined ? { quarrySupplierId } : {}),
      })
      .returning({ id: orderStoneLines.id });

    await recacheDealType(tx, orderId);
    return { id: inserted[0].id };
  });
}

// Update a stone line; dealType does not change on edit (composition unchanged).
export async function updateStoneLine(
  id: string,
  input: UpdateStoneLineInput,
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const [line] = await tx
      .select({ id: orderStoneLines.id })
      .from(orderStoneLines)
      .where(eq(orderStoneLines.id, id))
      .limit(1);
    if (!line) throw new TradeError(404, "Товарная линия не найдена");

    const quarrySupplierId = await resolveQuarry(tx, input);
    await tx
      .update(orderStoneLines)
      .set({
        ...lineValues(input),
        ...(quarrySupplierId !== undefined ? { quarrySupplierId } : {}),
        updatedAt: new Date(),
      })
      .where(eq(orderStoneLines.id, id));

    return { id };
  });
}

// Remove a stone line and refresh the dealType cache (a deal may revert to wagons_only
// or NULL once its last stone line is gone).
export async function deleteStoneLine(id: string): Promise<{ orderId: string }> {
  return db.transaction(async (tx) => {
    const deleted = await tx
      .delete(orderStoneLines)
      .where(eq(orderStoneLines.id, id))
      .returning({ orderId: orderStoneLines.orderId });
    if (!deleted[0]) throw new TradeError(404, "Товарная линия не найдена");

    await recacheDealType(tx, deleted[0].orderId);
    return { orderId: deleted[0].orderId };
  });
}
