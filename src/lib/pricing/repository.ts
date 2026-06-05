import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { counterparties } from "@/lib/db/schema/counterparties";
import {
  counterpartyContracts,
  priceProtocolRates,
  priceProtocols,
} from "@/lib/db/schema/pricing";
import { counterpartyRoleFor, deriveSide } from "./side";
import type { AppendRatesInput, CreatePriceProtocolInput, RateLineInput } from "./schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function toDate(iso: string | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function rateValues(protocolId: string, rates: readonly RateLineInput[]) {
  return rates.map((r) => ({
    protocolId,
    originRaw: r.originRaw,
    destRaw: r.destRaw,
    wagonType: r.wagonType,
    rate: String(r.rate), // NUMERIC column → string
    rateBasis: r.rateBasis,
  }));
}

// Resolve the counterparty: an explicit id wins; otherwise find-or-create by
// canonical name (operator inline-create). The implied commercial role is recorded
// on new counterparties.
async function resolveCounterpartyId(
  tx: Tx,
  input: CreatePriceProtocolInput["counterparty"],
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

async function resolveContractId(
  tx: Tx,
  contractRef: string | undefined,
  counterpartyId: string,
): Promise<string | null> {
  if (!contractRef) return null;
  const existing = await tx
    .select({ id: counterpartyContracts.id })
    .from(counterpartyContracts)
    .where(
      and(
        eq(counterpartyContracts.contractRef, contractRef),
        eq(counterpartyContracts.counterpartyId, counterpartyId),
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0].id;

  const created = await tx
    .insert(counterpartyContracts)
    .values({ contractRef, counterpartyId })
    .returning({ id: counterpartyContracts.id });
  return created[0].id;
}

// Create a ПСЦ header + its rate lines atomically; optionally supersede a prior
// protocol (new приложение marks the old one 'superseded' and links the chain).
export async function createPriceProtocol(
  input: CreatePriceProtocolInput,
): Promise<{ id: string }> {
  const side = deriveSide(input.rnsRole);
  const role = counterpartyRoleFor(side);

  return db.transaction(async (tx) => {
    const counterpartyId = await resolveCounterpartyId(tx, input.counterparty, role);
    const contractId = await resolveContractId(tx, input.contractRef, counterpartyId);

    const inserted = await tx
      .insert(priceProtocols)
      .values({
        protocolNumber: input.protocolNumber,
        contractId,
        counterpartyId,
        side,
        protocolDate: toDate(input.protocolDate),
        vatInclusive: input.vatInclusive,
        vatRate: String(input.vatRate),
        validFrom: toDate(input.validFrom),
        status: "active",
      })
      .returning({ id: priceProtocols.id });

    const protocolId = inserted[0].id;
    await tx.insert(priceProtocolRates).values(rateValues(protocolId, input.rates));

    if (input.supersedesProtocolId) {
      await tx
        .update(priceProtocols)
        .set({ status: "superseded", supersededBy: protocolId })
        .where(eq(priceProtocols.id, input.supersedesProtocolId));
    }

    return { id: protocolId };
  });
}

// Append rate lines to an existing protocol (POST /api/price-protocol-rates).
export async function appendRates(input: AppendRatesInput): Promise<{ count: number }> {
  await db.insert(priceProtocolRates).values(rateValues(input.protocolId, input.rates));
  return { count: input.rates.length };
}
