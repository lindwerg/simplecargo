import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Accessibility audit (P0-11, DESIGN_DIRECTION §6). Runs axe (WCAG 2.1 A/AA) on
// the funnel surfaces in BOTH themes. Local prerequisites:
//   1. local Postgres reachable via .env, schema migrated (`pnpm db:migrate`)
//   2. a seeded operator: SEED_USER_EMAIL / SEED_USER_PASSWORD in env, `pnpm db:seed:user`
//   3. a built app served at E2E_BASE_URL (default http://localhost:3000) — use
//      `pnpm build && pnpm exec next start` (dev's react-refresh eval is CSP-blocked).
// Run: `pnpm exec playwright test`.

const EMAIL = process.env.SEED_USER_EMAIL ?? "operator@simplecargo.local";
const PASSWORD = process.env.SEED_USER_PASSWORD ?? "operatorpass1";

const GATED_PATHS = ["/dashboard", "/requests"] as const;
const PUBLIC_PATHS = ["/login"] as const;
const THEMES = ["dark", "light"] as const;
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] as const;

function summarize(violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]): string {
  return violations.map((v) => `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))`).join("\n");
}

test.describe.configure({ mode: "serial" });

test("axe: gated funnel surfaces, both themes, zero WCAG AA violations", async ({ page, baseURL }) => {
  // Sign in via the auth API — the Set-Cookie lands in the page's context cookie
  // jar, so subsequent navigations are authenticated without driving the form.
  const res = await page.request.post("/api/auth/sign-in/email", {
    data: { email: EMAIL, password: PASSWORD },
  });
  expect(res.ok(), `sign-in failed (${res.status()}) — is the operator seeded?`).toBeTruthy();

  for (const theme of THEMES) {
    await page.context().addCookies([{ name: "theme", value: theme, url: baseURL! }]);
    for (const path of GATED_PATHS) {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      const { violations } = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze();
      expect(violations, `${theme} ${path}:\n${summarize(violations)}`).toEqual([]);
    }
  }
});

test("axe: public login, both themes, zero WCAG AA violations", async ({ page, baseURL }) => {
  for (const theme of THEMES) {
    await page.context().addCookies([{ name: "theme", value: theme, url: baseURL! }]);
    for (const path of PUBLIC_PATHS) {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      const { violations } = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze();
      expect(violations, `${theme} ${path}:\n${summarize(violations)}`).toEqual([]);
    }
  }
});
