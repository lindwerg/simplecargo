import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db/client";
import { orders } from "@/lib/db/schema/orders";
import { directions } from "@/lib/db/schema/directions";
import { orderStoneLines } from "@/lib/db/schema/orderStoneLines";
import {
  resolveCounterpartyId,
  type CounterpartyInput,
} from "@/lib/counterparties/resolve";
import { canTransition, type DealStatus } from "./lifecycle";
import { TradeError, type Tx } from "./repository";

// ── Запрос (quoting worksheet) — single-form upsert + lifecycle transitions ──
// A «Запрос» edits ONE primary transport direction and/or ONE primary stone line for a
// deal from a single worksheet (no per-component CRUD). Lifecycle actions move the deal
// across the funnel: просчёт → цена дана (quoted) → прошли (won) → Заявка (confirmed) →
// ГУ/заадресация (active) → Завершена (completed) | Архив (cancelled).

// ── Types ────────────────────────────────────────────────────────────────────
export interface CounterpartyRef {
  id?: string | undefined;
  name?: string | undefined;
  inn?: string | undefined;
}

interface StationRef {
  raw: string;
  esr: string | null;
}

export interface UpsertDealQuoteInput {
  cargoType: "stone_only" | "wagons_only" | "stone_with_transport";
  cargoName?: string | null | undefined;
  origin?: StationRef | null | undefined;
  dest?: StationRef | null | undefined;
  client?: CounterpartyRef | null | undefined;
  owner?: CounterpartyRef | null | undefined;
  quarry?: CounterpartyRef | null | undefined;
  rateClient?: string | null | undefined;
  rateOwner?: string | null | undefined;
  wagonCount?: number | null | undefined;
  priceSale?: string | null | undefined;
  pricePurchase?: string | null | undefined;
  tonnage?: string | null | undefined;
  fraction?: string | null | undefined;
}

export type LifecycleAction = "quoted" | "won" | "application" | "gu" | "complete" | "archive";

// ── Helpers ────────────────────────────────────────────────────────────────────
const includesWagons = (t: UpsertDealQuoteInput["cargoType"]): boolean =>
  t === "wagons_only" || t === "stone_with_transport";

const includesStone = (t: UpsertDealQuoteInput["cargoType"]): boolean =>
  t === "stone_only" || t === "stone_with_transport";

// Map a CounterpartyRef (id OR name[+inn]) onto the shared resolver input. Returns
// undefined when the ref carries neither an id nor a name (nothing to resolve).
function toCounterpartyInput(ref: CounterpartyRef | null | undefined): CounterpartyInput | undefined {
  if (!ref) return undefined;
  if (ref.id) return { id: ref.id };
  if (ref.name && ref.name.trim().length > 0) {
    return ref.inn ? { name: ref.name, inn: ref.inn } : { name: ref.name };
  }
  return undefined;
}

// Upsert the single primary transport direction for a deal. Returns its id.
async function upsertPrimaryDirection(
  tx: Tx,
  orderId: string,
  input: UpsertDealQuoteInput,
  userId: string,
): Promise<string> {
  const clientInput = toCounterpartyInput(input.client);
  const ownerInput = toCounterpartyInput(input.owner);
  const clientCounterpartyId = clientInput
    ? await resolveCounterpartyId(tx, clientInput, "client")
    : null;
  const ownerCounterpartyId = ownerInput
    ? await resolveCounterpartyId(tx, ownerInput, "owner")
    : null;

  const originRaw = input.origin?.raw ?? null;
  const destRaw = input.dest?.raw ?? null;
  const displayName =
    originRaw && destRaw ? `${originRaw} → ${destRaw}` : null;

  const values = {
    stationOriginRaw: originRaw,
    stationOriginEsr: input.origin?.esr ?? null,
    stationDestRaw: destRaw,
    stationDestEsr: input.dest?.esr ?? null,
    displayName,
    cargoName: input.cargoName ?? "щебень",
    wagonCountPlanned: input.wagonCount ?? null,
    rateClient: input.rateClient ?? null,
    rateOwner: input.rateOwner ?? null,
    clientCounterpartyId,
    ownerCounterpartyId,
  };

  const [existing] = await tx
    .select({ id: directions.id })
    .from(directions)
    .where(eq(directions.orderId, orderId))
    .orderBy(asc(directions.createdAt))
    .limit(1);

  if (existing) {
    await tx
      .update(directions)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(directions.id, existing.id));
    return existing.id;
  }

  const inserted = await tx
    .insert(directions)
    .values({
      orderId,
      status: "draft",
      createdBy: userId,
      statusChangedBy: userId,
      ...values,
    })
    .returning({ id: directions.id });
  return inserted[0].id;
}

// Upsert the single primary stone line for a deal. Returns its id.
async function upsertPrimaryStoneLine(
  tx: Tx,
  orderId: string,
  input: UpsertDealQuoteInput,
): Promise<string> {
  const quarryInput = toCounterpartyInput(input.quarry);
  const quarrySupplierId = quarryInput
    ? await resolveCounterpartyId(tx, quarryInput, "quarry")
    : null;

  const values = {
    quarrySupplierId,
    quarryRaw: input.quarry?.name ?? null,
    locationRaw: input.origin?.raw ?? null,
    locationEsr: input.origin?.esr ?? null,
    fraction: input.fraction ?? null,
    cargoName: input.cargoName ?? "щебень",
    tonnage: input.tonnage ?? null,
    pricePurchase: input.pricePurchase ?? null,
    priceSale: input.priceSale ?? null,
  };

  const [existing] = await tx
    .select({ id: orderStoneLines.id })
    .from(orderStoneLines)
    .where(eq(orderStoneLines.orderId, orderId))
    .orderBy(asc(orderStoneLines.createdAt))
    .limit(1);

  if (existing) {
    await tx
      .update(orderStoneLines)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(orderStoneLines.id, existing.id));
    return existing.id;
  }

  const inserted = await tx
    .insert(orderStoneLines)
    .values({ orderId, ...values })
    .returning({ id: orderStoneLines.id });
  return inserted[0].id;
}

// ── Repository: upsert worksheet ────────────────────────────────────────────────
// Set the deal's composition (cargoType → dealType) and upsert the single primary
// direction and/or stone line in one transaction. Returns the touched ids (null when
// the component is not part of the chosen cargoType).
export async function upsertDealQuote(
  dealId: string,
  input: UpsertDealQuoteInput,
  userId: string,
): Promise<{ directionId: string | null; stoneLineId: string | null }> {
  return db.transaction(async (tx) => {
    const [deal] = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.id, dealId))
      .limit(1);
    if (!deal) throw new TradeError(404, "Сделка не найдена");

    await tx
      .update(orders)
      .set({ dealType: input.cargoType, updatedAt: new Date() })
      .where(eq(orders.id, dealId));

    const directionId = includesWagons(input.cargoType)
      ? await upsertPrimaryDirection(tx, dealId, input, userId)
      : null;

    const stoneLineId = includesStone(input.cargoType)
      ? await upsertPrimaryStoneLine(tx, dealId, input)
      : null;

    return { directionId, stoneLineId };
  });
}

// ── Repository: lifecycle transition ─────────────────────────────────────────────
export async function transitionDealLifecycle(
  dealId: string,
  action: LifecycleAction,
  payload: { lostReason?: string | undefined; guNumber?: string | undefined },
  userId: string,
): Promise<{ status: string; quoteStatus: string; guNumber: string | null }> {
  return db.transaction(async (tx) => {
    const [deal] = await tx
      .select({
        status: orders.status,
        quoteStatus: orders.quoteStatus,
        guNumber: orders.guNumber,
      })
      .from(orders)
      .where(eq(orders.id, dealId))
      .limit(1);
    if (!deal) throw new TradeError(404, "Сделка не найдена");

    const now = new Date();
    const current = deal.status as DealStatus;
    const patch: Record<string, unknown> = { updatedAt: now };

    switch (action) {
      case "quoted":
        patch.quoteStatus = "quoted";
        patch.quotedAt = now;
        break;
      case "won":
        patch.quoteStatus = "won";
        break;
      case "application":
        if (!canTransition(current, "confirmed")) {
          throw new TradeError(409, "Недопустимый переход");
        }
        patch.status = "confirmed";
        patch.confirmedAt = now;
        patch.confirmedBy = userId;
        break;
      case "gu":
        if (!payload.guNumber || payload.guNumber.trim().length === 0) {
          throw new TradeError(422, "Укажите номер ГУ");
        }
        if (!canTransition(current, "active")) {
          throw new TradeError(409, "Недопустимый переход");
        }
        patch.guNumber = payload.guNumber.trim();
        patch.status = "active";
        break;
      case "complete":
        if (!canTransition(current, "completed")) {
          throw new TradeError(409, "Недопустимый переход");
        }
        patch.status = "completed";
        break;
      case "archive":
        if (!canTransition(current, "cancelled")) {
          throw new TradeError(409, "Недопустимый переход");
        }
        patch.status = "cancelled";
        patch.lostReason = payload.lostReason ?? null;
        break;
    }

    const [updated] = await tx
      .update(orders)
      .set(patch)
      .where(eq(orders.id, dealId))
      .returning({
        status: orders.status,
        quoteStatus: orders.quoteStatus,
        guNumber: orders.guNumber,
      });

    return updated;
  });
}

// ── Zod schemas ──────────────────────────────────────────────────────────────────
const esr = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Код ЕСР — 6 цифр")
  .nullable();

// Numeric (drizzle numeric) money/tonnage fields are passed as strings; keep nullable.
const numericString = z.string().trim().min(1).nullable().optional();

const stationRef = z
  .object({
    raw: z.string().trim().min(1, "Станция"),
    esr: esr.optional().transform((v) => v ?? null),
  })
  .nullable()
  .optional();

const counterpartyRef = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1).optional(),
    inn: z.string().trim().min(1).optional(),
  })
  .nullable()
  .optional();

export const upsertDealQuoteSchema = z.object({
  cargoType: z.enum(["stone_only", "wagons_only", "stone_with_transport"]),
  cargoName: z.string().trim().min(1).nullable().optional(),
  origin: stationRef,
  dest: stationRef,
  client: counterpartyRef,
  owner: counterpartyRef,
  quarry: counterpartyRef,
  rateClient: numericString,
  rateOwner: numericString,
  wagonCount: z.coerce.number().int().min(0).nullable().optional(),
  priceSale: numericString,
  pricePurchase: numericString,
  tonnage: numericString,
  fraction: z.string().trim().min(1).nullable().optional(),
});

export const dealLifecycleSchema = z.object({
  action: z.enum(["quoted", "won", "application", "gu", "complete", "archive"]),
  lostReason: z.string().trim().min(1).optional(),
  guNumber: z.string().trim().min(1).optional(),
});
