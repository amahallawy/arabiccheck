// End-to-end tests of the built page (AgDR-0008): run `npm run build`, then `npm run test:e2e`.
import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
  testDir: "./e2e",
  // The first load downloads and caches about 33 MB of models and runtime.
  timeout: 180_000,
  expect: { timeout: 30_000 },
  workers: 1,
  forbidOnly: Boolean(process.env["CI"]),
  reporter: process.env["CI"] ? [["github"], ["list"]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, serviceWorkers: "allow", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env["CI"],
    timeout: 60_000,
  },
});
