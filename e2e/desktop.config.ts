import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "desktop",
  outputDir: "test-results/desktop",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  retries: 0,
  workers: 1,
  reporter: [["list"]],
});
