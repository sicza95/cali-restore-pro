import { defineConfig } from 'vitest/config';

// Unit tests for the UI-independent platform layer and the router. Browser flows stay in Playwright.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/platform/**/*.test.ts', 'src/ui/router/**/*.test.ts'],
    restoreMocks: true,
    unstubGlobals: true,
  },
});
