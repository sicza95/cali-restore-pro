import { defineConfig } from '@playwright/test';
import { devOrigin, filesPorts } from './tests-platform/files-origins';

// Desktop Chromium profile (#50): `npm run test:perf`, then `npm run perf:compare`. One worker and
// no retries, so a run measures one browser with nothing else on the page.
export default defineConfig({
  testDir: 'tests-platform',
  testMatch: ['perf-profile.browser.ts'],
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: 'test-results/perf',
  use: {
    baseURL: devOrigin,
    browserName: 'chromium',
    channel: process.env.CI ? undefined : 'chrome',
    viewport: { width: 1194, height: 834 },
  },
  webServer: {
    command: `node node_modules/vite/bin/vite.js --config vite.app.config.ts --host 127.0.0.1 --port ${filesPorts.dev} --strictPort`,
    url: devOrigin,
    reuseExistingServer: false,
  },
});
