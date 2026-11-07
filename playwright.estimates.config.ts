import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests-estimates',
  testMatch: '*.spec.ts',
  reporter: 'list',
});
