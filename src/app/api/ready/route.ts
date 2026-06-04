import { pool } from "@/lib/db/client";
import { EXPECTED_MIGRATIONS, isSchemaReady } from "@/lib/db/readiness";

// Readiness probe (P0-9, ARCHITECTURE §4): asserts the DB has applied exactly the
// migration set this build ships, so traffic never lands on a half-migrated
// schema. Separate from /api/health (liveness): a reachable-but-stale DB is live
// yet not ready. Queries public.__drizzle_migrations — the same table migrate.ts
// pins.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function appliedMigrationCount(): Promise<number> {
  const result = await pool.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM public."__drizzle_migrations"',
  );
  return result.rows[0]?.n ?? 0;
}

export async function GET(): Promise<Response> {
  try {
    const applied = await appliedMigrationCount();
    const ready = isSchemaReady(applied, EXPECTED_MIGRATIONS);
    return Response.json(
      { status: ready ? "ready" : "stale", applied, expected: EXPECTED_MIGRATIONS },
      { status: ready ? 200 : 503 },
    );
  } catch (error: unknown) {
    console.error(
      "[ready] schema-version check failed:",
      error instanceof Error ? error.message : error,
    );
    return Response.json({ status: "error" }, { status: 503 });
  }
}
