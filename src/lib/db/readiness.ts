import journal from "../../../drizzle/migrations/meta/_journal.json";

// Schema-version readiness (ARCHITECTURE §4). The build ships a fixed set of
// migrations (the journal); a container is "ready" only once the DB has applied
// exactly that many. Guards against a green deploy over a half-migrated schema.
// Kept free of any DB/env import so it stays a pure, unit-testable unit.
export const EXPECTED_MIGRATIONS = journal.entries.length;

export function isSchemaReady(applied: number, expected: number): boolean {
  return applied === expected;
}
