import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests-sync',
  use: {
    baseURL: 'http://127.0.0.1:5197',
    browserName: 'chromium',
    channel: process.env.CI ? undefined : 'chrome',
  },
  webServer: {
    command: 'vite --config vite.app.config.ts --host 127.0.0.1 --port 5197 --strictPort',
    url: 'http://127.0.0.1:5197',
    reuseExistingServer: !process.env.CI,
  },
});
