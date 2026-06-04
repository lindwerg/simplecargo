import { expect, test } from "@playwright/test";

// Dashboard LCP probe (P0-11/P0-12 perf budget; MVP_PLAN §0.4 item 12: LCP < 2.5s).
// Local-only / on-demand: point E2E_BASE_URL at the live deploy and provide the
// seeded operator creds to measure the real (network) LCP. The dashboard LCP
// element is server-rendered text, so this should clear the budget comfortably.

const EMAIL = process.env.SEED_USER_EMAIL ?? "operator@simplecargo.local";
const PASSWORD = process.env.SEED_USER_PASSWORD ?? "operatorpass1";
const LCP_BUDGET_MS = 2500;

test("dashboard LCP is under the 2.5s budget", async ({ page }) => {
  const res = await page.request.post("/api/auth/sign-in/email", {
    data: { email: EMAIL, password: PASSWORD },
  });
  expect(res.ok(), `sign-in failed (${res.status()})`).toBeTruthy();

  await page.goto("/dashboard", { waitUntil: "networkidle" });

  const lcp = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const obs = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const last = entries[entries.length - 1] as PerformanceEntry & { renderTime?: number; loadTime?: number };
          resolve(last.renderTime ?? last.loadTime ?? last.startTime);
        });
        obs.observe({ type: "largest-contentful-paint", buffered: true });
        // Resolve after a short settle window in case no further LCP fires.
        setTimeout(() => resolve(performance.getEntriesByType("largest-contentful-paint").at(-1)?.startTime ?? 0), 1500);
      }),
  );

  // eslint-disable-next-line no-console
  console.log(`dashboard LCP: ${Math.round(lcp)}ms`);
  expect(lcp).toBeLessThan(LCP_BUDGET_MS);
});
