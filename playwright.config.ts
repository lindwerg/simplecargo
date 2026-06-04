import { defineConfig, devices } from "@playwright/test";

// E2E accessibility harness (P0-11). LOCAL-ONLY for now: it axe-audits the gated
// surfaces in both themes against a running server (build + migrate + seed-user
// prerequisites, see e2e/a11y.spec.ts header). The heavy CI job (Postgres service
// + seed + auth) is deferred to P1.5 when the real boards carry meaningful
// content — auditing today's placeholder shells in CI would be low-signal.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
