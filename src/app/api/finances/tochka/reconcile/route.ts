import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { ReconcileError, setManualLink, unlinkTransaction } from "@/lib/finances/reconcile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ReconcileBody {
  transactionId?: unknown;
  counterpartyId?: unknown;
  dealId?: unknown;
}

function asId(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

// POST — manually attach an operation to a counterparty and/or deal. Writer-only.
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireWriter(request.headers);
    const body = (await request.json()) as ReconcileBody;
    const transactionId = asId(body.transactionId);
    if (!transactionId) return apiFail("Не указана операция", 422);

    await setManualLink({
      transactionId,
      counterpartyId: asId(body.counterpartyId),
      dealId: asId(body.dealId),
      userId: user.id,
    });
    return apiOk({ ok: true });
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof ReconcileError) return apiFail(error.message, error.status);
    console.error("[finances] reconcile failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось разнести операцию", 500);
  }
}

// DELETE — remove the operation's links (back to the «не разнесено» queue).
export async function DELETE(request: Request): Promise<Response> {
  try {
    await requireWriter(request.headers);
    const { searchParams } = new URL(request.url);
    const transactionId = asId(searchParams.get("transactionId"));
    if (!transactionId) return apiFail("Не указана операция", 422);
    await unlinkTransaction(transactionId);
    return apiOk({ ok: true });
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error("[finances] unlink failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось снять разнос", 500);
  }
}
