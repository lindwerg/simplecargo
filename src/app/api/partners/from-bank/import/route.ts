import { z } from "zod";

import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { importFromBank, type ImportItem } from "@/lib/partners/import-from-bank";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const itemSchema = z.object({
  inn: z.string().trim().max(12).nullable().optional(),
  name: z.string().trim().min(1),
  nameVariants: z.array(z.string()).default([]),
  role: z.enum(["client", "carrier"]),
  email: z.string().trim().nullable().optional(),
});

const payloadSchema = z.object({
  items: z.array(itemSchema).min(1, "Не выбрано ни одного контрагента").max(500),
});

// POST — занести выбранных контрагентов из банковской выгрузки в реестр.
export async function POST(request: Request): Promise<Response> {
  try {
    await requireWriter(request.headers);
    const body: unknown = await request.json();
    const parsed = payloadSchema.safeParse(body);
    if (!parsed.success) {
      return apiFail(parsed.error.issues[0]?.message ?? "Некорректные данные", 422);
    }

    const items: ImportItem[] = parsed.data.items.map((i) => ({
      inn: i.inn ?? null,
      name: i.name,
      nameVariants: i.nameVariants,
      role: i.role,
      email: i.email ?? null,
    }));

    const result = await importFromBank(items);
    return apiOk(result);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error(
      "[partners] from-bank import failed:",
      error instanceof Error ? error.message : error,
    );
    return apiFail("Не удалось занести контрагентов", 500);
  }
}
