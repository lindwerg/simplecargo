import { z } from "zod";

import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireSession } from "@/lib/api/session";
import { db } from "@/lib/db/client";
import { resolveStationName } from "@/lib/geo/resolver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Input for the confirm-step resolver: a dictated/typed station name + optional road hint.
const resolveSchema = z.object({
  q: z.string().min(1, "Введите название станции"),
  roadHint: z.string().optional(),
});

// Run the resolver and return only the parts the confirm UI needs.
async function resolve(q: string, roadHint: string | undefined): Promise<Response> {
  const { status, candidates } = await resolveStationName(db, q, roadHint);
  return apiOk({ status, candidates });
}

// POST — resolve a station name to scored ESR candidates for an operator to confirm.
// Read-only (any signed-in role); never writes.
export async function POST(request: Request): Promise<Response> {
  try {
    await requireSession(request.headers);

    const body: unknown = await request.json().catch(() => null);
    const parsed = resolveSchema.safeParse(body);
    if (!parsed.success) {
      return apiFail(parsed.error.issues[0]?.message ?? "Некорректные данные", 400);
    }

    return await resolve(parsed.data.q, parsed.data.roadHint);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error("[stations] resolve failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось распознать станцию", 500);
  }
}

// GET — convenience variant: ?q=&roadHint= for quick lookups from the URL.
export async function GET(request: Request): Promise<Response> {
  try {
    await requireSession(request.headers);

    const { searchParams } = new URL(request.url);
    const parsed = resolveSchema.safeParse({
      q: searchParams.get("q") ?? "",
      roadHint: searchParams.get("roadHint") ?? undefined,
    });
    if (!parsed.success) {
      return apiFail(parsed.error.issues[0]?.message ?? "Некорректные данные", 400);
    }

    return await resolve(parsed.data.q, parsed.data.roadHint);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error("[stations] resolve failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось распознать станцию", 500);
  }
}
