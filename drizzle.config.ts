import { defineConfig } from "drizzle-kit";

// Migrations always use DATABASE_URL_DIRECT (direct Postgres, never a pooler).
// The schema path is populated in P0-3 — `db:generate` is exercised there.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema/index.ts",
  out: "./drizzle/migrations",
  dbCredentials: { url: process.env.DATABASE_URL_DIRECT! },
  migrations: { table: "__drizzle_migrations", schema: "public" },
  strict: true, // prompt on destructive changes
  verbose: true,
});
