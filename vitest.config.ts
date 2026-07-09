import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    // `tests/` holds Playwright specs (run via `npm run test:e2e`), not vitest ones.
    exclude: ["**/node_modules/**", "**/tests/**"],
  },
});
