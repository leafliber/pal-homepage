import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

const baseURL = process.env.BASE_URL || "http://127.0.0.1:4321";
const chromePath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "artifacts/playwright-report", open: "never" }],
  ],
  outputDir: "artifacts/test-results",
  use: {
    baseURL,
    browserName: "chromium",
    ...(existsSync(chromePath) ? { channel: "chrome" } : {}),
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    reducedMotion: "no-preference",
    launchOptions: { args: ["--enable-unsafe-swiftshader"] },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "pnpm preview --host 127.0.0.1 --port 4321",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      },
});
