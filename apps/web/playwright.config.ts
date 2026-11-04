import { defineConfig } from "@playwright/test";

/**
 * The browser projects of the isolated harness.
 *
 * The names are the single source of truth for the harness. The global setup
 * forwards them to the owned API child, which creates one distinct synthetic
 * legacy employee per project name. A worker consumes only the record that
 * belongs to its own project.
 */
export const E2E_BROWSER_PROJECTS = ["desktop", "narrow"] as const;

export type E2eBrowserProject = (typeof E2E_BROWSER_PROJECTS)[number];

/**
 * The harness owns its API, its database and its Next process. It never reuses
 * a developer server, a developer database or a shared port, so no `webServer`
 * entry is configured here.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  globalSetup: "./e2e/global-setup.ts",
  outputDir: "node_modules/.cache/playwright-artifacts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    // The journeys carry credentials. No trace, video or screenshot artifact may
    // capture a credential-bearing page.
    trace: "off",
    video: "off",
    screenshot: "off",
    navigationTimeout: 60_000,
  },
  projects: [
    {
      name: "desktop",
      use: {
        browserName: "chromium",
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "narrow",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
