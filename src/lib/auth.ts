import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { db } from "@/lib/db/client";
import { accounts, sessions, users, verifications } from "@/lib/db/schema/auth";
import { env } from "@/lib/env";

const isDev = env.NODE_ENV === "development";

// Better Auth instance (P0-4). Email/password with Postgres-backed sessions
// (no Redis secondary storage at MVP — ARCHITECTURE §1/§6). The P0-3 auth tables
// are plural (`users`/`sessions`/…), so we map them onto Better Auth's singular
// model names explicitly. Argon2id hashing, CSRF, and rate limiting are built-in.
export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
    // Internal tool: first operator is created via seed-user.ts, not open signup.
    disableSignUp: true,
    requireEmailVerification: false,
    minPasswordLength: 10,
  },
  user: {
    additionalFields: {
      // Mirrors the `role` column + CHECK on the users table (DB_SCHEMA §1).
      // input:false — clients can never set their own role.
      role: {
        type: ["admin", "operator", "viewer"],
        required: false,
        defaultValue: "operator",
        input: false,
      },
    },
  },
  trustedOrigins: isDev
    ? [env.BETTER_AUTH_URL, "http://localhost:3000"]
    : [env.BETTER_AUTH_URL],
  advanced: {
    // `users.id` is uuid DEFAULT gen_random_uuid(); defer id generation to the DB
    // instead of letting Better Auth emit a non-UUID string into a uuid column.
    database: { generateId: false },
    // Railway terminates TLS at its proxy; honor x-forwarded-host/proto.
    trustedProxyHeaders: true,
  },
});
