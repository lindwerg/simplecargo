import { z } from "zod";

import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireSession } from "@/lib/api/session";
import { computeRzdQuote, type QuoteInput } from "@/lib/tariff/quoteService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ESR = z.string().trim().regex(/^\d{6}$/, "ЕСР — 6 цифр");

const quoteSchema = z.object({
  originEsr: ESR,
  destEsr: ESR,
  etsngCode: z.string().trim().min(1, "Код ЕТСНГ"),
  ownership: z.enum(["own", "rzd"]),
  wagonType: z.string().trim().min(1, "Тип вагона"),
  // Коэффициент собственника: включает отдельный блок «инвентарный И+В + предоставление».
  ownerCoeff: z.coerce.number().positive("Коэффициент > 0").max(10).optional(),
  wagons: z
    .array(
      z.object({
        capacityT: z.coerce.number().positive("Грузоподъёмность > 0"),
        count: z.coerce.number().int().positive("Число вагонов > 0"),
        innovative: z.boolean(),
      }),
    )
    .min(1, "Добавьте хотя бы одну группу вагонов"),
});

// POST — compute the РЖД provозная плата (Layer-1, без НДС → с НДС) for a route.
// Read-only compute; any logged-in user. The engine returns a red/yellow verdict with a
// reason instead of a price when inputs are outside the validated own-полувагон class-1 contour.
export async function POST(request: Request): Promise<Response> {
  try {
    await requireSession(request.headers);

    const body: unknown = await request.json().catch(() => null);
    const parsed = quoteSchema.safeParse(body);
    if (!parsed.success) {
      return apiFail(parsed.error.issues[0]?.message ?? "Некорректные данные", 400);
    }

    const result = await computeRzdQuote(parsed.data as QuoteInput);
    return apiOk(result);
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return apiFail(error.message, error.status);
    }
    const message =
      error instanceof Error ? error.message : "Не удалось рассчитать тариф";
    return apiFail(message, 500);
  }
}
