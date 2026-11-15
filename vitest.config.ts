import { defineConfig } from 'vitest/config';

// Unit tests for the UI-independent platform layer and UI-level checks. Browser flows stay in Playwright.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/platform/**/*.test.ts', 'src/ui/**/*.test.ts'],
    restoreMocks: true,
    unstubGlobals: true,
  },
});
