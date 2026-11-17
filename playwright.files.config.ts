import { defineConfig, type PlaywrightTestConfig } from '@playwright/test';
import { devOrigin, filesPorts, previewOrigin } from './tests-platform/files-origins';

// Comma-separated Playwright engines, e.g. FILES_BROWSERS=firefox,webkit (#51). Unset keeps the
// default single Chrome run; the informational CI browser job sets it.
const browsers = (process.env.FILES_BROWSERS ?? '')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);

const projects: PlaywrightTestConfig['projects'] = browsers.length
  ? browsers.map((browserName) => ({
      name: browserName,
      use: {
        browserName: browserName as 'chromium' | 'firefox' | 'webkit',
        channel: browserName === 'chromium' && !process.env.CI ? 'chrome' : undefined,
      },
    }))
  : undefined;

export default defineConfig({
  projects,
  testDir: 'tests-platform',
  testMatch: [
    'estimates.browser.ts',
    'estimate-rows.browser.ts',
    'encrypted-files.browser.ts',
    'image-import.browser.ts',
    'original-pins.browser.ts',
    'project-backups.browser.ts',
    'projects.browser.ts',
    'surface-journal.browser.ts',
    'planar-reference.browser.ts',
    'drawing-geometry.browser.ts',
    'project-reviews.browser.ts',
    'project-review-scopes.browser.ts',
    'scope-too-large.browser.ts',
    'report-exports.browser.ts',
    'measured-reports.browser.ts',
    'project-trash.browser.ts',
    'admin-layout.browser.ts',
    'admin-references.browser.ts',
  ],
  outputDir: 'test-results/encrypted-files',
  use: { baseURL: devOrigin, channel: process.env.CI ? undefined : 'chrome' },
  webServer: [
    {
      command: `node node_modules/vite/bin/vite.js --config vite.app.config.ts --host 127.0.0.1 --port ${filesPorts.dev} --strictPort`,
      url: devOrigin,
    },
    {
      command: `node node_modules/vite/bin/vite.js build --config vite.app.config.ts && node node_modules/vite/bin/vite.js preview --config vite.app.config.ts --host 127.0.0.1 --port ${filesPorts.preview} --strictPort`,
      url: previewOrigin,
    },
  ],
});
