// Cross-process realtime via Postgres LISTEN/NOTIFY (MAIL_AI_INTEGRATION §2.1 —
// replaces Redis pub/sub; Redis is not provisioned). The mail-worker PUBLISHes
// after a commit; the web instance's listener (pg-listener.ts) fans out to SSE.
// Payload stays tiny (≤ 8000-byte NOTIFY limit): just a kind + optional id.

import { pool } from "@/lib/db/client";

export const REALTIME_CHANNEL = "requests_new";

export type RealtimeKind = "request" | "invoice" | "quarantine" | "email";

export interface RealtimeEvent {
  kind: RealtimeKind;
  id?: string | null;
}

/** Best-effort publish — a NOTIFY failure must never break the intake transaction. */
export async function publishRealtime(ev: RealtimeEvent): Promise<void> {
  try {
    await pool.query("SELECT pg_notify($1, $2)", [REALTIME_CHANNEL, JSON.stringify(ev)]);
  } catch (error: unknown) {
    console.error("[realtime] publish failed:", error instanceof Error ? error.message : error);
  }
}
