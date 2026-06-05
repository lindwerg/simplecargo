import { eq } from "drizzle-orm";
import { z } from "zod";

import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { db } from "@/lib/db/client";
import { stationAliases, stations } from "@/lib/db/schema/geo";
import { normalizeStationName } from "@/lib/geo/normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Confidence stamped on operator-confirmed fuzzy aliases (<1.0 = not an exact match).
const FUZZY_CONFIRMED_CONFIDENCE = "0.900";

// ESR is the canonical 6-char station key (DB_SCHEMA §2).
const ESR_CODE_LENGTH = 6;

const confirmAliasSchema = z.object({
  alias: z.string().min(1, "Введите написание станции"),
  esrCode: z.string().length(ESR_CODE_LENGTH, "Код ЕСР должен содержать 6 символов"),
});

// POST — self-train the resolver: confirm that a distorted spelling (`alias`)
// belongs to `esrCode`. Inserts a fuzzy_confirmed station_alias so next time the
// same spelling resolves exactly. Requires a writer. Idempotent via the unique
// alias_normalized + onConflictDoNothing → { created: boolean }.
export async function POST(request: Request): Promise<Response> {
  try {
    await requireWriter(request.headers);

    const body: unknown = await request.json().catch(() => null);
    const parsed = confirmAliasSchema.safeParse(body);
    if (!parsed.success) {
      return apiFail(parsed.error.issues[0]?.message ?? "Некорректные данные", 400);
    }

    const { alias, esrCode } = parsed.data;

    const existing = await db
      .select({ esrCode: stations.esrCode })
      .from(stations)
      .where(eq(stations.esrCode, esrCode))
      .limit(1);
    if (existing.length === 0) {
      return apiFail("Станция с таким кодом ЕСР не найдена", 404);
    }

    const aliasNormalized = normalizeStationName(alias);
    if (!aliasNormalized) {
      return apiFail("Написание станции пустое после нормализации", 400);
    }

    const inserted = await db
      .insert(stationAliases)
      .values({
        esrCode,
        alias,
        aliasNormalized,
        source: "fuzzy_confirmed",
        confidence: FUZZY_CONFIRMED_CONFIDENCE,
      })
      .onConflictDoNothing({ target: stationAliases.aliasNormalized })
      .returning({ id: stationAliases.id });

    return apiOk({ created: inserted.length > 0 });
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error("[stations] confirm-alias failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось сохранить написание станции", 500);
  }
}
