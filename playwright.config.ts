import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:6006',
    browserName: 'chromium',
    channel: process.env.CI ? undefined : 'chrome',
    viewport: { width: 1194, height: 834 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --ci',
    url: 'http://127.0.0.1:6006',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
