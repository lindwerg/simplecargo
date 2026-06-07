import { and, eq, ne, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { counterparties } from "@/lib/db/schema/counterparties";
import { directions } from "@/lib/db/schema/directions";
import { orders } from "@/lib/db/schema/orders";
import {
  directionClientBindings,
  directionOwnerBindings,
} from "@/lib/db/schema/directionBindings";
import { deriveDealType } from "@/lib/trades/derive";
import { evaluateActivation } from "./activation";
import { canTransition, type DirectionStatus } from "./lifecycle";
import type {
  ClientBindingInput,
  CreateDirectionInput,
  OwnerBindingInput,
  TransitionDirectionInput,
  UpdateDirectionInput,
} from "./schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Domain error mapped to an HTTP status by the route handlers (parallel to AuthError).
export class DirectionError extends Error {
  constructor(
    public readonly status: 404 | 409 | 422,
    message: string,
  ) {
    super(message);
    this.name = "DirectionError";
  }
}

type CounterpartyInput = NonNullable<CreateDirectionInput["client"]>;

function toDate(iso: string | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function numStr(n: number | undefined): string | null {
  return n === undefined ? null : String(n);
}

function toNumber(value: string | null): number | null {
  return value === null ? null : Number(value);
}

// Resolve a counterparty: explicit id wins; otherwise find-or-create by canonical name
// (operator inline-create), recording the implied commercial role. Mirrors the ПСЦ idiom.
async function resolveCounterpartyId(
  tx: Tx,
  input: CounterpartyInput,
  role: "owner" | "client",
): Promise<string> {
  if ("id" in input) return input.id;

  const name = input.name.trim();
  const existing = await tx
    .select({ id: counterparties.id })
    .from(counterparties)
    .where(eq(counterparties.nameCanonical, name))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const created = await tx
    .insert(counterparties)
    .values({ nameCanonical: name, inn: input.inn, roles: [role] })
    .returning({ id: counterparties.id });
  return created[0].id;
}

function defaultDisplayName(displayName: string | undefined, originRaw: string, destRaw: string): string {
  return displayName ?? `${originRaw} → ${destRaw}`;
}

// Re-cache orders.deal_type from the deal's transport-direction count (Фаза 1). Stone
// lines (hasStone) arrive in Фаза 2 — false for now. Runs inside the caller's tx so the
// dealType cache stays consistent with the deal composition.
async function recacheOrderDealType(tx: Tx, orderId: string): Promise<void> {
  const [{ n }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(directions)
    .where(eq(directions.orderId, orderId));
  const next = deriveDealType(false, n > 0);
  await tx.update(orders).set({ dealType: next, updatedAt: new Date() }).where(eq(orders.id, orderId));
}

export async function createDirection(
  input: CreateDirectionInput,
  userId: string,
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const clientCounterpartyId = input.client
      ? await resolveCounterpartyId(tx, input.client, "client")
      : null;
    const ownerCounterpartyId = input.owner
      ? await resolveCounterpartyId(tx, input.owner, "owner")
      : null;

    // Confirmed rates land in rate_client/rate_owner ONLY on explicit confirm.
    const rateClient = input.ratesConfirmed ? numStr(input.rateClient) : null;
    const rateOwner = input.ratesConfirmed ? numStr(input.rateOwner) : null;

    const inserted = await tx
      .insert(directions)
      .values({
        orderId: input.orderId ?? null,
        displayName: defaultDisplayName(input.displayName, input.stationOriginRaw, input.stationDestRaw),
        status: "draft",
        statusChangedBy: userId,
        stationOriginRaw: input.stationOriginRaw,
        stationDestRaw: input.stationDestRaw,
        cargoName: input.cargoName,
        wagonCountPlanned: input.wagonCountPlanned,
        tonnagePerWagon: numStr(input.tonnagePerWagon),
        rateClient,
        rateOwner,
        rateModel: input.rateModel,
        clientCounterpartyId,
        ownerCounterpartyId,
        paymentTermsRaw: input.paymentTermsRaw,
        validFrom: toDate(input.validFrom),
        validTo: toDate(input.validTo),
        createdBy: userId,
      })
      .returning({ id: directions.id });

    // Keep the deal's deal_type cache in sync when the direction joins an order.
    if (input.orderId) await recacheOrderDealType(tx, input.orderId);

    return { id: inserted[0].id };
  });
}

async function loadDirection(tx: Tx, id: string) {
  const rows = await tx.select().from(directions).where(eq(directions.id, id)).limit(1);
  if (!rows[0]) throw new DirectionError(404, "Направление не найдено");
  return rows[0];
}

export async function updateDirection(
  id: string,
  input: UpdateDirectionInput,
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const current = await loadDirection(tx, id);
    if (current.status !== "draft" && current.status !== "open") {
      throw new DirectionError(409, "Редактировать можно только черновик или открытое направление");
    }

    const patch: Partial<typeof directions.$inferInsert> = { updatedAt: new Date() };

    if (input.displayName !== undefined) patch.displayName = input.displayName;
    if (input.stationOriginRaw !== undefined) patch.stationOriginRaw = input.stationOriginRaw;
    if (input.stationDestRaw !== undefined) patch.stationDestRaw = input.stationDestRaw;
    if (input.cargoName !== undefined) patch.cargoName = input.cargoName;
    if (input.wagonCountPlanned !== undefined) patch.wagonCountPlanned = input.wagonCountPlanned;
    if (input.tonnagePerWagon !== undefined) patch.tonnagePerWagon = numStr(input.tonnagePerWagon);
    if (input.rateModel !== undefined) patch.rateModel = input.rateModel;
    if (input.paymentTermsRaw !== undefined) patch.paymentTermsRaw = input.paymentTermsRaw;
    if (input.validFrom !== undefined) patch.validFrom = toDate(input.validFrom);
    if (input.validTo !== undefined) patch.validTo = toDate(input.validTo);

    if (input.client !== undefined) {
      patch.clientCounterpartyId = await resolveCounterpartyId(tx, input.client, "client");
    }
    if (input.owner !== undefined) {
      patch.ownerCounterpartyId = await resolveCounterpartyId(tx, input.owner, "owner");
    }

    // Confirmed rates are written only with an explicit confirm in the same payload.
    if (input.ratesConfirmed) {
      if (input.rateClient !== undefined) patch.rateClient = numStr(input.rateClient);
      if (input.rateOwner !== undefined) patch.rateOwner = numStr(input.rateOwner);
    }

    await tx.update(directions).set(patch).where(eq(directions.id, id));
    return { id };
  });
}

// Does the direction's active owner mailbox(es) collide with another open/active
// direction's active binding? (M1 — cross-table check the partial index can't express.)
async function hasOwnerMailboxConflict(tx: Tx, directionId: string): Promise<boolean> {
  const own = await tx
    .select({ mailbox: directionOwnerBindings.inboundMailbox })
    .from(directionOwnerBindings)
    .where(
      and(
        eq(directionOwnerBindings.directionId, directionId),
        eq(directionOwnerBindings.status, "active"),
      ),
    );
  const mailboxes = own.map((r) => r.mailbox);
  if (mailboxes.length === 0) return false;

  const clash = await tx
    .select({ id: directionOwnerBindings.id })
    .from(directionOwnerBindings)
    .innerJoin(directions, eq(directionOwnerBindings.directionId, directions.id))
    .where(
      and(
        inArray(directionOwnerBindings.inboundMailbox, mailboxes),
        eq(directionOwnerBindings.status, "active"),
        ne(directionOwnerBindings.directionId, directionId),
        inArray(directions.status, ["open", "active"]),
      ),
    )
    .limit(1);
  return clash.length > 0;
}

export async function transitionDirection(
  id: string,
  input: TransitionDirectionInput,
  userId: string,
): Promise<{ id: string; status: DirectionStatus }> {
  return db.transaction(async (tx) => {
    const current = await loadDirection(tx, id);
    const from = current.status as DirectionStatus;
    const to = input.to;

    if (!canTransition(from, to)) {
      throw new DirectionError(409, `Недопустимый переход: ${from} → ${to}`);
    }

    if (to === "active") {
      const [ownerCount, clientCount, conflict] = await Promise.all([
        tx
          .select({ n: sql<number>`count(*)::int` })
          .from(directionOwnerBindings)
          .where(
            and(
              eq(directionOwnerBindings.directionId, id),
              eq(directionOwnerBindings.status, "active"),
            ),
          ),
        tx
          .select({ n: sql<number>`count(*)::int` })
          .from(directionClientBindings)
          .where(
            and(
              eq(directionClientBindings.directionId, id),
              eq(directionClientBindings.status, "active"),
            ),
          ),
        hasOwnerMailboxConflict(tx, id),
      ]);

      const result = evaluateActivation({
        clientCounterpartyId: current.clientCounterpartyId,
        rateClient: toNumber(current.rateClient),
        rateOwner: toNumber(current.rateOwner),
        activeOwnerBindings: ownerCount[0]?.n ?? 0,
        activeClientBindings: clientCount[0]?.n ?? 0,
        ownerMailboxConflict: conflict,
      });

      if (!result.ok) {
        const reasons = result.guards
          .filter((g) => g.status === "failed")
          .map((g) => g.message)
          .join("; ");
        throw new DirectionError(422, `Активация заблокирована: ${reasons}`);
      }
    }

    await tx
      .update(directions)
      .set({ status: to, statusChangedAt: new Date(), statusChangedBy: userId, updatedAt: new Date() })
      .where(eq(directions.id, id));

    return { id, status: to };
  });
}

export async function deleteDirection(id: string): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const current = await loadDirection(tx, id);
    if (current.status !== "draft") {
      throw new DirectionError(409, "Удалять можно только черновик — остальные отменяйте");
    }
    await tx.delete(directions).where(eq(directions.id, id));
    return { id };
  });
}

// ── Bindings ──────────────────────────────────────────────────────────────────

// Drizzle wraps the pg error in a DrizzleQueryError, so the SQLSTATE code can live on
// the error itself or on its `.cause`. Check both.
function isUniqueViolation(error: unknown): boolean {
  const hasCode23505 = (e: unknown): boolean =>
    typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "23505";
  if (hasCode23505(error)) return true;
  if (typeof error === "object" && error !== null && "cause" in error) {
    return hasCode23505((error as { cause?: unknown }).cause);
  }
  return false;
}

export async function addOwnerBinding(
  directionId: string,
  input: OwnerBindingInput,
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    await loadDirection(tx, directionId);
    const ownerId = await resolveCounterpartyId(tx, input.owner, "owner");
    try {
      const inserted = await tx
        .insert(directionOwnerBindings)
        .values({
          directionId,
          ownerId,
          inboundMailbox: input.inboundMailbox,
          expectedWagonIds: input.expectedWagonIds,
          wagonCountAllocated: input.wagonCountAllocated,
          ownerRateOverride: numStr(input.ownerRateOverride),
        })
        .returning({ id: directionOwnerBindings.id });
      return { id: inserted[0].id };
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new DirectionError(409, "Ящик уже привязан к активному направлению");
      }
      throw error;
    }
  });
}

export async function removeOwnerBinding(
  directionId: string,
  bindingId: string,
): Promise<{ id: string }> {
  const deleted = await db
    .delete(directionOwnerBindings)
    .where(
      and(
        eq(directionOwnerBindings.id, bindingId),
        eq(directionOwnerBindings.directionId, directionId),
      ),
    )
    .returning({ id: directionOwnerBindings.id });
  if (!deleted[0]) throw new DirectionError(404, "Привязка не найдена");
  return { id: deleted[0].id };
}

/** Дописать распознанные номера вагонов в expected_wagon_ids активной owner-привязки
 *  направления (объединение, без дублей). Пишем ТОЛЬКО когда активная привязка ровно
 *  одна — иначе не угадать, в какую (возвращаем saved:false, письмо всё равно
 *  привязывается выше по стеку). */
export async function mergeExpectedWagons(
  directionId: string,
  wagonNumbers: string[],
): Promise<{ saved: boolean; expectedCount: number }> {
  if (wagonNumbers.length === 0) return { saved: false, expectedCount: 0 };
  const active = await db
    .select({ id: directionOwnerBindings.id, expected: directionOwnerBindings.expectedWagonIds })
    .from(directionOwnerBindings)
    .where(
      and(
        eq(directionOwnerBindings.directionId, directionId),
        eq(directionOwnerBindings.status, "active"),
      ),
    );
  if (active.length !== 1) return { saved: false, expectedCount: 0 };

  const union = [...new Set([...(active[0].expected ?? []), ...wagonNumbers])];
  await db
    .update(directionOwnerBindings)
    .set({ expectedWagonIds: union, updatedAt: new Date() })
    .where(eq(directionOwnerBindings.id, active[0].id));
  return { saved: true, expectedCount: union.length };
}

export async function addClientBinding(
  directionId: string,
  input: ClientBindingInput,
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    await loadDirection(tx, directionId);
    const clientId = await resolveCounterpartyId(tx, input.client, "client");
    const inserted = await tx
      .insert(directionClientBindings)
      .values({
        directionId,
        clientId,
        forwardToEmail: input.forwardToEmail,
        forwardCcEmails: input.forwardCcEmails,
      })
      .returning({ id: directionClientBindings.id });
    return { id: inserted[0].id };
  });
}

export async function removeClientBinding(
  directionId: string,
  bindingId: string,
): Promise<{ id: string }> {
  const deleted = await db
    .delete(directionClientBindings)
    .where(
      and(
        eq(directionClientBindings.id, bindingId),
        eq(directionClientBindings.directionId, directionId),
      ),
    )
    .returning({ id: directionClientBindings.id });
  if (!deleted[0]) throw new DirectionError(404, "Привязка не найдена");
  return { id: deleted[0].id };
}
