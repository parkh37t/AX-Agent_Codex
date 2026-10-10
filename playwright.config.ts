import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Reuse an installed browser in managed environments; never download one in a test.
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ||
  [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/opt/pw-browsers/chromium/chrome-linux/chrome",
  ].find((path) => existsSync(path));
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5173";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 2,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: "list",
  outputDir:
    process.env.PLAYWRIGHT_OUTPUT_DIR ||
    join(tmpdir(), "ax-studio-playwright-results"),
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    acceptDownloads: true,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
        launchOptions: { executablePath },
      },
    },
  ],
  // Browser tests replace /api/* themselves. Starting only Vite cannot invoke Codex.
  webServer: {
    command: "npm exec vite -- --host 127.0.0.1 --port 5173 --strictPort",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
