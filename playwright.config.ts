import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: process.env.BASE_URL || "https://veda2.vercel.app",
    headless: true,
    viewport: { width: 430, height: 932 }, // iPhone-ish
    ignoreHTTPSErrors: true,
  },
  outputDir: "test-results",
});
