import { defineConfig } from '@playwright/test';
import config from './playwright.config';

export default defineConfig({
  ...config,
  use: { ...config.use, baseURL: 'http://127.0.0.1:6198' },
  webServer: {
    command:
      'node node_modules/vite/bin/vite.js preview --outDir storybook-static --host 127.0.0.1 --port 6198 --strictPort',
    url: 'http://127.0.0.1:6198',
  },
});
