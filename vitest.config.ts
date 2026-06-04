import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Mirror the tsconfig `@/*` path alias so tests can import app modules the same
// way source does.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Unit/integration tests live next to source as *.test.ts. The Playwright a11y
    // specs under e2e/ use the @playwright/test runner, not vitest — keep them out.
    include: ["src/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**"],
  },
});
