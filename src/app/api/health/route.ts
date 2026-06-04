import { pool } from "@/lib/db/client";

// Liveness probe (P0-9). Railway's deploy healthcheck (railway.json →
// healthcheckPath: /api/health, 60s timeout) holds the old container until this
// returns 200, giving zero-downtime deploys. Middleware skips /api/* so there's
// no auth/CSP interference.
export const runtime = "nodejs"; // pg needs Node, not the edge runtime
export const dynamic = "force-dynamic"; // never cache a health result

// Bound the DB ping well under Railway's 60s healthcheck window so a hung/maxed
// connection pool fails fast as 503 instead of stalling the whole healthcheck.
const DB_PING_TIMEOUT_MS = 5_000;

async function pingDb(): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`DB ping exceeded ${DB_PING_TIMEOUT_MS}ms`)),
      DB_PING_TIMEOUT_MS,
    );
  });
  try {
    await Promise.race([pool.query("SELECT 1"), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(): Promise<Response> {
  try {
    await pingDb();
    return Response.json({ status: "ok" }, { status: 200 });
  } catch (error: unknown) {
    // stdout → Railway log ingestion. Body stays opaque (no DB error detail).
    console.error(
      "[health] DB unreachable:",
      error instanceof Error ? error.message : error,
    );
    return Response.json({ status: "error" }, { status: 503 });
  }
}
