import { z } from "zod";

import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { RequestError } from "@/lib/requests/repository";
import { OutreachError, sendRfqToCarriers } from "@/lib/rfq/outreach";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  carrierIds: z.array(z.uuid()).min(1, "Выберите хотя бы одного перевозчика"),
  lineIds: z.array(z.uuid()).optional(),
});

// POST — send the request's RFQ to selected carriers by e-mail, record polls.
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireWriter(request.headers);
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return apiFail("Некорректный идентификатор", 400);

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiFail(parsed.error.issues[0]?.message ?? "Некорректные данные", 400);
    }

    const result = await sendRfqToCarriers({
      requestId: id,
      carrierIds: parsed.data.carrierIds,
      ...(parsed.data.lineIds ? { lineIds: parsed.data.lineIds } : {}),
    });
    return apiOk(result);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof OutreachError) return apiFail(error.message, error.status);
    if (error instanceof RequestError) return apiFail(error.message, error.status);
    console.error("[requests] outreach failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось отправить запрос перевозчикам", 500);
  }
}
