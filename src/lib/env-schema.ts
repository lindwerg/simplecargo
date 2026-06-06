import { z } from "zod";

// Fail-fast environment contract for the `web` service (ARCHITECTURE §13.4).
// This module is side-effect-free — importing it never validates or exits, so it
// is safe to use in tests. The eager singleton lives in `env.ts`.
export const envSchema = z.object({
  // App runtime queries (direct Postgres in P1/P2; pooler later).
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  // drizzle-kit migrate only — ALWAYS direct Postgres, never a pooler.
  DATABASE_URL_DIRECT: z.string().min(1, "DATABASE_URL_DIRECT is required"),
  // Better Auth (wired now, consumed from P0-4). `openssl rand -hex 32` → 64 chars.
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 chars"),
  BETTER_AUTH_URL: z.url("BETTER_AUTH_URL must be a valid URL"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  // Display timezone (storage is UTC, display is MSK).
  APP_TZ_DISPLAY: z.string().default("Europe/Moscow"),
  // Filesystem root for uploaded counterparty documents (договоры/заявки/сканы).
  // Prod = a mounted Railway volume (e.g. "/data"); local dev defaults to ./.storage.
  STORAGE_DIR: z.string().min(1).default("./.storage"),
  // AI intake (OpenRouter) — OPTIONAL so build/CI boot without it. When absent,
  // the request-extraction endpoint degrades gracefully (501 + operator hint).
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_MODEL: z.string().min(1).default("google/gemini-2.5-flash"),
  // Tochka Bank Open API (Финансы tab). All OPTIONAL so build/CI boot without
  // them; the finance routes degrade gracefully (501 + operator hint) when the
  // JWT is absent. The JWT is a SECRET — env/Railway only, never committed.
  // Default base points at the sandbox; set TOCHKA_BASE_URL to the prod URL
  // (e.g. https://enter.tochka.com/uapi) when going live.
  TOCHKA_BASE_URL: z.url().default("https://enter.tochka.com/sandbox/v2"),
  TOCHKA_JWT_TOKEN: z.string().min(1).optional(),
  TOCHKA_CLIENT_ID: z.string().min(1).optional(), // нужен для путей вебхуков
  TOCHKA_CUSTOMER_CODE: z.string().min(1).optional(),
  TOCHKA_WEBHOOK_PUBKEY_URL: z
    .url()
    .default("https://enter.tochka.com/doc/openapi/static/keys/public"),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate environment variables. On failure, prints each problem and
 * exits the process — kept separate from the eager `env` singleton so callers can
 * validate an arbitrary source (and tests can exercise it) deliberately.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    console.error("❌ Invalid environment configuration:");
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "(root)";
      console.error(`  • ${key}: ${issue.message}`);
    }
    process.exit(1);
  }
  return parsed.data;
}
