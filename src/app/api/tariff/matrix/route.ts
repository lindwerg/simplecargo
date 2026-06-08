import { z } from "zod";

import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireSession } from "@/lib/api/session";
import { computeQuoteMatrix, type MatrixInput } from "@/lib/tariff/quoteMatrix";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ESR = z.string().trim().regex(/^\d{6}$/, "ЕСР — 6 цифр");

const matrixSchema = z.object({
  originEsr: ESR,
  destEsr: ESR,
  etsngCode: z.string().trim().min(1).optional(),
  classicCapacityT: z.coerce.number().positive("Г/п > 0").optional(),
  innovativeCapacityT: z.coerce.number().positive("Г/п > 0").optional(),
  markupPct: z.coerce.number().finite().optional(),
});

// POST — матрица «обычный/инновационный × группы» для маршрута: 5 групп ТР-1 × оба типа
// вагона, с тарифом и ставкой предоставления (тариф + наценка%), без НДС и с НДС.
// Read-only; любой вошедший. Вне контура (own ПВ, класс 1, домашнее) возвращает причину + расстояние.
export async function POST(request: Request): Promise<Response> {
  try {
    await requireSession(request.headers);

    const body: unknown = await request.json().catch(() => null);
    const parsed = matrixSchema.safeParse(body);
    if (!parsed.success) {
      return apiFail(parsed.error.issues[0]?.message ?? "Некорректные данные", 400);
    }

    const result = await computeQuoteMatrix(parsed.data as MatrixInput);
    return apiOk(result);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    const message = error instanceof Error ? error.message : "Не удалось рассчитать матрицу";
    console.error("[tariff] matrix failed:", message);
    return apiFail(message, 500);
  }
}
