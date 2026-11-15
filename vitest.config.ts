import { defineConfig } from 'vitest/config';

// Unit tests for the UI-independent platform layer. Browser flows stay in Playwright.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/platform/**/*.test.ts'],
    restoreMocks: true,
    unstubGlobals: true,
  },
});
