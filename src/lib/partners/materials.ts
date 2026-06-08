// CRUD каталога щебня карьера (quarry_materials). Цена и характеристики паспорта.
// Поля паспорта могут предзаполняться ИИ (см. passport-extract.ts), но источник
// истины — то, что подтвердил оператор.

import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db/client";
import { quarryMaterials } from "@/lib/db/schema/quarryMaterials";
import { counterparties } from "@/lib/db/schema/counterparties";
import { PartnerError } from "./repository";

// Свободные «значение из паспорта» — строки (диапазоны, «М1200», «F150», «1 группа»).
const passportFieldsSchema = z.record(z.string(), z.string()).nullable().optional();

export const materialSchema = z.object({
  materialName: z.string().trim().min(1).max(120).default("щебень"),
  fraction: z.string().trim().max(40).nullish(),
  gost: z.string().trim().max(60).nullish(),
  strengthGrade: z.string().trim().max(40).nullish(),
  flakiness: z.string().trim().max(60).nullish(),
  frostResistance: z.string().trim().max(40).nullish(),
  radioactivityClass: z.string().trim().max(40).nullish(),
  abrasion: z.string().trim().max(40).nullish(),
  bulkDensity: z.number().positive().max(99999999).nullish(),
  passportFields: passportFieldsSchema,
  pricePerTon: z.number().nonnegative().max(999999999999).nullish(),
  currency: z.string().trim().length(3).default("RUB"),
  priceValidFrom: z.string().trim().nullish(),
  locationEsr: z.string().trim().length(6).nullish(),
  locationRaw: z.string().trim().max(200).nullish(),
  passportDocumentId: z.uuid().nullish(),
  quarryRaw: z.string().trim().max(200).nullish(),
  notes: z.string().trim().max(2000).nullish(),
});

export type MaterialInput = z.infer<typeof materialSchema>;

export interface QuarryMaterialRow {
  id: string;
  materialName: string;
  fraction: string | null;
  gost: string | null;
  strengthGrade: string | null;
  flakiness: string | null;
  frostResistance: string | null;
  radioactivityClass: string | null;
  abrasion: string | null;
  bulkDensity: number | null;
  passportFields: Record<string, string> | null;
  pricePerTon: number | null;
  currency: string;
  priceValidFrom: Date | null;
  locationEsr: string | null;
  locationRaw: string | null;
  passportDocumentId: string | null;
  quarryRaw: string | null;
  notes: string | null;
  createdAt: Date;
}

function toNum(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapRow(r: typeof quarryMaterials.$inferSelect): QuarryMaterialRow {
  return {
    id: r.id,
    materialName: r.materialName,
    fraction: r.fraction,
    gost: r.gost,
    strengthGrade: r.strengthGrade,
    flakiness: r.flakiness,
    frostResistance: r.frostResistance,
    radioactivityClass: r.radioactivityClass,
    abrasion: r.abrasion,
    bulkDensity: toNum(r.bulkDensity),
    passportFields: (r.passportFields as Record<string, string> | null) ?? null,
    pricePerTon: toNum(r.pricePerTon),
    currency: r.currency,
    priceValidFrom: r.priceValidFrom,
    locationEsr: r.locationEsr,
    locationRaw: r.locationRaw,
    passportDocumentId: r.passportDocumentId,
    quarryRaw: r.quarryRaw,
    notes: r.notes,
    createdAt: r.createdAt,
  };
}

async function assertQuarryExists(partnerId: string): Promise<void> {
  const rows = await db
    .select({ id: counterparties.id })
    .from(counterparties)
    .where(eq(counterparties.id, partnerId))
    .limit(1);
  if (!rows[0]) throw new PartnerError(404, "Карьер не найден");
}

export async function listPartnerMaterials(partnerId: string): Promise<QuarryMaterialRow[]> {
  const rows = await db
    .select()
    .from(quarryMaterials)
    .where(eq(quarryMaterials.quarryCounterpartyId, partnerId))
    .orderBy(asc(quarryMaterials.materialName), asc(quarryMaterials.fraction));
  return rows.map(mapRow);
}

// Maps validated input → DB values (numbers → numeric strings, date string → Date).
function toValues(input: MaterialInput) {
  return {
    materialName: input.materialName,
    fraction: input.fraction ?? null,
    gost: input.gost ?? null,
    strengthGrade: input.strengthGrade ?? null,
    flakiness: input.flakiness ?? null,
    frostResistance: input.frostResistance ?? null,
    radioactivityClass: input.radioactivityClass ?? null,
    abrasion: input.abrasion ?? null,
    bulkDensity: input.bulkDensity != null ? String(input.bulkDensity) : null,
    passportFields: input.passportFields ?? null,
    pricePerTon: input.pricePerTon != null ? String(input.pricePerTon) : null,
    currency: input.currency,
    priceValidFrom: input.priceValidFrom ? new Date(input.priceValidFrom) : null,
    locationEsr: input.locationEsr ?? null,
    locationRaw: input.locationRaw ?? null,
    passportDocumentId: input.passportDocumentId ?? null,
    quarryRaw: input.quarryRaw ?? null,
    notes: input.notes ?? null,
  };
}

export async function createMaterial(
  partnerId: string,
  input: MaterialInput,
): Promise<{ id: string }> {
  await assertQuarryExists(partnerId);
  const inserted = await db
    .insert(quarryMaterials)
    .values({ quarryCounterpartyId: partnerId, ...toValues(input) })
    .returning({ id: quarryMaterials.id });
  return { id: inserted[0].id };
}

export async function updateMaterial(
  partnerId: string,
  materialId: string,
  input: MaterialInput,
): Promise<{ id: string }> {
  const updated = await db
    .update(quarryMaterials)
    .set({ ...toValues(input), updatedAt: new Date() })
    .where(
      and(
        eq(quarryMaterials.id, materialId),
        eq(quarryMaterials.quarryCounterpartyId, partnerId),
      ),
    )
    .returning({ id: quarryMaterials.id });
  if (!updated[0]) throw new PartnerError(404, "Позиция не найдена");
  return { id: updated[0].id };
}

export async function deleteMaterial(
  partnerId: string,
  materialId: string,
): Promise<{ id: string }> {
  const deleted = await db
    .delete(quarryMaterials)
    .where(
      and(
        eq(quarryMaterials.id, materialId),
        eq(quarryMaterials.quarryCounterpartyId, partnerId),
      ),
    )
    .returning({ id: quarryMaterials.id });
  if (!deleted[0]) throw new PartnerError(404, "Позиция не найдена");
  return { id: deleted[0].id };
}
