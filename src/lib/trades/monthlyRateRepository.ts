import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { directionMonthlyRates } from "@/lib/db/schema/directionMonthlyRates";
import { directions } from "@/lib/db/schema/directions";
import { TradeError } from "./repository";
import type { UpsertMonthlyRateInput } from "./monthlyRateSchema";

// CRUD for per-month direction rates (plan §4, Фаза 4). Upsert is keyed on the composite
// unique (direction_id, effective_month); `agree` promotes proposed → agreed in the same
// write. Confirmed money is operator-entered (D16) — suggested values stay separate.

// A monthly-rate row as read for the deal card. Numeric columns arrive as strings.
export interface MonthlyRateView {
  id: string;
  effectiveMonth: string;
  rateClient: string | null;
  rateOwner: string | null;
  rateClientSuggested: string | null;
  rateOwnerSuggested: string | null;
  currency: string;
  rateBasis: string | null;
  status: string;
  agreedAt: Date | null;
}

const baseSelect = {
  id: directionMonthlyRates.id,
  effectiveMonth: directionMonthlyRates.effectiveMonth,
  rateClient: directionMonthlyRates.rateClient,
  rateOwner: directionMonthlyRates.rateOwner,
  rateClientSuggested: directionMonthlyRates.rateClientSuggested,
  rateOwnerSuggested: directionMonthlyRates.rateOwnerSuggested,
  currency: directionMonthlyRates.currency,
  rateBasis: directionMonthlyRates.rateBasis,
  status: directionMonthlyRates.status,
  agreedAt: directionMonthlyRates.agreedAt,
} as const;

// List the monthly rates of a direction, newest month first.
export async function listMonthlyRates(directionId: string): Promise<MonthlyRateView[]> {
  return db
    .select(baseSelect)
    .from(directionMonthlyRates)
    .where(eq(directionMonthlyRates.directionId, directionId))
    .orderBy(asc(directionMonthlyRates.effectiveMonth));
}

// Build the column patch from a validated input. Amounts come pre-coerced (number|undefined).
function rateValues(input: UpsertMonthlyRateInput): Record<string, unknown> {
  const v: Record<string, unknown> = {};
  if (input.rateClient !== undefined) v.rateClient = String(input.rateClient);
  if (input.rateOwner !== undefined) v.rateOwner = String(input.rateOwner);
  if (input.rateClientSuggested !== undefined)
    v.rateClientSuggested = String(input.rateClientSuggested);
  if (input.rateOwnerSuggested !== undefined)
    v.rateOwnerSuggested = String(input.rateOwnerSuggested);
  if (input.currency) v.currency = input.currency;
  if (input.rateBasis) v.rateBasis = input.rateBasis;
  return v;
}

// Upsert a monthly rate for (directionId, effectiveMonth). When `agree` is set the row is
// promoted to 'agreed' with an audit stamp; otherwise it stays/returns 'proposed'.
export async function upsertMonthlyRate(
  directionId: string,
  input: UpsertMonthlyRateInput,
  userId: string,
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const [dir] = await tx
      .select({ id: directions.id })
      .from(directions)
      .where(eq(directions.id, directionId))
      .limit(1);
    if (!dir) throw new TradeError(404, "Направление не найдено");

    const now = new Date();
    const patch = rateValues(input);
    const statusFields = input.agree
      ? { status: "agreed", agreedAt: now, agreedBy: userId }
      : {};

    const inserted = await tx
      .insert(directionMonthlyRates)
      .values({
        directionId,
        effectiveMonth: input.effectiveMonth,
        createdBy: userId,
        ...patch,
        ...statusFields,
      })
      .onConflictDoUpdate({
        target: [directionMonthlyRates.directionId, directionMonthlyRates.effectiveMonth],
        set: { ...patch, ...statusFields, updatedAt: now },
      })
      .returning({ id: directionMonthlyRates.id });

    return { id: inserted[0].id };
  });
}

// Promote an existing proposed row to agreed (the deliberate confirm step).
export async function agreeMonthlyRate(
  id: string,
  userId: string,
): Promise<{ id: string }> {
  const updated = await db
    .update(directionMonthlyRates)
    .set({ status: "agreed", agreedAt: new Date(), agreedBy: userId, updatedAt: new Date() })
    .where(and(eq(directionMonthlyRates.id, id), eq(directionMonthlyRates.status, "proposed")))
    .returning({ id: directionMonthlyRates.id });
  if (!updated[0]) throw new TradeError(404, "Ставка не найдена или уже согласована");
  return { id: updated[0].id };
}
