// DDL through a transaction-mode pooler (PgBouncer) intermittently corrupts —
// advisory locks and multi-statement migrations break. Migrations therefore run
// ONLY against a direct Postgres URL. This guard refuses anything that looks like
// a pooler endpoint (ARCHITECTURE §4, §13.3).
const POOLER_PATTERN = /pgbouncer|pooler/i;

export function assertDirectMigrationUrl(url: string | undefined): string {
  if (!url) {
    throw new Error("DATABASE_URL_DIRECT is required for migrations");
  }
  if (POOLER_PATTERN.test(url)) {
    throw new Error(
      "Refusing to migrate through a pooler URL — DATABASE_URL_DIRECT must point at Postgres directly",
    );
  }
  return url;
}
