import { defineConfig } from '@playwright/test';

const origin = 'http://127.0.0.1:4184';

export default defineConfig({
  testDir: 'tests-platform',
  testMatch: [
    'estimates.browser.ts',
    'encrypted-files.browser.ts',
    'image-import.browser.ts',
    'original-pins.browser.ts',
    'project-backups.browser.ts',
    'projects.browser.ts',
    'planar-reference.browser.ts',
    'drawing-geometry.browser.ts',
    'project-reviews.browser.ts',
    'project-review-scopes.browser.ts',
    'report-exports.browser.ts',
  ],
  outputDir: 'test-results/encrypted-files',
  use: { baseURL: origin, channel: process.env.CI ? undefined : 'chrome' },
  webServer: [
    {
      command:
        'node node_modules/vite/bin/vite.js --config vite.app.config.ts --host 127.0.0.1 --port 4184 --strictPort',
      url: origin,
    },
    {
      command:
        'node node_modules/vite/bin/vite.js build --config vite.app.config.ts && node node_modules/vite/bin/vite.js preview --config vite.app.config.ts --host 127.0.0.1 --port 4186 --strictPort',
      url: 'http://127.0.0.1:4186',
    },
  ],
});
