// Side-effect-only env loader for standalone scripts (tsx). Import this FIRST,
// before any module that reads `@/lib/env`, so process.env is populated from .env
// before the eager env singleton validates. No-ops if .env is absent (prod/CI
// inject vars directly). Node ≥20.6 ships process.loadEnvFile.
try {
  (process as unknown as { loadEnvFile: (p?: string) => void }).loadEnvFile(".env");
} catch {
  // .env may not exist (Railway/CI) — env comes from the real environment.
}
