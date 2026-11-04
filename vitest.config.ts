import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Unit-test configuration for the deterministic agent engines (relevance,
 * ranking, intent validation, rate limiting, tool budgets). E2E scenario
 * checks live in `scripts/phase4-checks.mjs` and run against a dev server.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
