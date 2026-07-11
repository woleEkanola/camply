import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PORT ?? "3001";
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Tests run against a single `next dev` process (not a clustered/production
  // server) — letting Playwright default to ~half the local CPU cores as
  // parallel workers overwhelms it under fullyParallel, producing ECONNRESET
  // and cold-compile timeout flakes that have nothing to do with the code
  // under test. Always run single-worker locally too, matching CI.
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  // The Systems Rule protocol boots the server itself (clean build -> start -> poll)
  // before invoking `playwright test`, so no webServer block here — it would
  // race with that manual boot step and fight over port 3001.
});
