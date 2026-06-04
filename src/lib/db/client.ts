import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "@/lib/env";
import * as schema from "./schema";

// Runtime connection pool for app queries. Uses DATABASE_URL (direct Postgres in
// P1/P2; a pooler is swapped in later without touching this file). max:5 keeps us
// well under Railway Postgres's connection cap across web instances + worker.
// Importing this module transitively runs env validation (fail-fast at boot).
export const pool = new Pool({ connectionString: env.DATABASE_URL, max: 5 });

// Drizzle query interface, bound to the canonical schema (P0-3) for typed queries.
export const db = drizzle(pool, { schema });
