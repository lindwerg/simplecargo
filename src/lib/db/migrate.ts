import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { assertDirectMigrationUrl } from "./assert-direct-url";

// Standalone migration runner (pnpm db:migrate + Railway preDeployCommand).
// Reads DATABASE_URL_DIRECT directly rather than via env.ts: migration depends
// only on the DB URL, so it stays runnable in a minimal env (ARCHITECTURE §13.3).
async function main(): Promise<void> {
  const url = assertDirectMigrationUrl(process.env.DATABASE_URL_DIRECT);
  const pool = new Pool({ connectionString: url });
  try {
    // Pin the bookkeeping table explicitly. The runtime migrator otherwise
    // defaults to drizzle.__drizzle_migrations, which would disagree with
    // drizzle.config.ts (public) and the /api/ready readiness probe that counts
    // applied rows. Keep all three on public.__drizzle_migrations.
    await migrate(drizzle(pool), {
      migrationsFolder: "drizzle/migrations",
      migrationsTable: "__drizzle_migrations",
      migrationsSchema: "public",
    });
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("❌ Migration failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
