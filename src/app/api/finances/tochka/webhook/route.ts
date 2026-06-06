import { fetchTochkaPublicKey, isPaymentEvent, isTokenFresh, verifyJwtRS256 } from "@/lib/finances/webhook";
import { syncTochka } from "@/lib/finances/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — Tochka push. Body is a signed JWT (text/plain). We verify the RS256
// signature with Tochka's public key, then on a payment event pull the fresh
// operation via a short statement re-sync (canonical shape + auto-reconcile).
// NOT behind requireSession — the bank carries no cookie; the signature IS the
// auth. Always fast-ACK 200 once verified so Tochka stops retrying.
export async function POST(request: Request): Promise<Response> {
  let token: string;
  try {
    token = (await request.text()).trim();
  } catch {
    return new Response("bad request", { status: 400 });
  }
  if (!token) return new Response("empty", { status: 400 });

  let key;
  try {
    key = await fetchTochkaPublicKey();
  } catch (error: unknown) {
    console.error("[finances] webhook pubkey error:", error instanceof Error ? error.message : error);
    return new Response("key unavailable", { status: 503 }); // let Tochka retry
  }

  const { valid, payload } = verifyJwtRS256(token, key);
  if (!valid) {
    return new Response("invalid signature", { status: 401 });
  }
  // Replay mitigation — drop a stale/expired (but validly-signed) token.
  if (!isTokenFresh(payload)) {
    return new Response("stale token", { status: 401 });
  }

  if (isPaymentEvent(payload)) {
    try {
      await syncTochka({ months: 1 });
    } catch (error: unknown) {
      // Don't fail the webhook on a sync hiccup — the periodic poll is the safety net.
      console.error("[finances] webhook sync error:", error instanceof Error ? error.message : error);
    }
  }

  return new Response("ok", { status: 200 });
}
