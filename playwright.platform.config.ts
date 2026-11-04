import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests-platform',
  workers: 1,
  reporter: 'list',
  outputDir: 'test-results/platform',
  use: {
    baseURL: process.env.SMOKE_ORIGIN ?? 'http://127.0.0.1:8080',
    browserName: 'chromium',
    channel: process.env.CI ? undefined : 'chrome',
    trace: 'retain-on-failure',
  },
});
