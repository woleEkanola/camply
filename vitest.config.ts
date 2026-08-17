import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Mirrors tsconfig.json's `paths`. Source files under src/app use the `@/`
  // alias, so without this vitest can't import any route handler under test.
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    // `tests/` holds Playwright specs (run via `npm run test:e2e`), not vitest ones.
    exclude: ["**/node_modules/**", "**/tests/**"],
  },
});
