import { z } from "zod";

import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { getEmailExtractableText, setInboxLink } from "@/lib/mail-intake/inbox-repo";
import { parseDislocation } from "@/lib/mail-intake/parse-dislocation";
import { mergeExpectedWagons } from "@/lib/directions/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  directionId: z.string().uuid(),
});

// POST — привязать письмо-дислокацию к направлению: разбираем пономерной список
// вагонов из тела/вложений, линкуем письмо к направлению и (если активная
// owner-привязка одна) дописываем номера в expected_wagon_ids — дальше схема
// раскладывает вагоны по направлению сама.
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireWriter(request.headers);
    const { id } = await ctx.params;
    if (!id) return apiFail("Некорректный идентификатор", 400);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiFail("Укажите направление", 400);

    const text = await getEmailExtractableText(id);
    const summary = parseDislocation(text);

    await setInboxLink(id, parsed.data.directionId);
    const merge = await mergeExpectedWagons(
      parsed.data.directionId,
      summary.wagons.map((w) => w.number),
    );

    return apiOk({
      directionId: parsed.data.directionId,
      summary,
      savedToBinding: merge.saved,
      expectedCount: merge.expectedCount,
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error("[inbox] dislocation failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось привязать дислокацию", 500);
  }
}
