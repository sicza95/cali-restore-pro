import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests-platform',
  // Seeds the invitations spec's synthetic sessions on a disposable stack (IDENTITY_SMOKE_DISPOSABLE=1).
  globalSetup: './tests-platform/m06-sessions.ts',
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
