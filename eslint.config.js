import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import solid from 'eslint-plugin-solid/configs/typescript';

export default tseslint.config(
  {
    ignores: [
      '.claude/**',
      'dist/**',
      'src/platform/api/**',
      'storybook-static/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: Object.fromEntries(
        ['process', 'console', 'URL', 'fetch', 'AbortSignal', 'setTimeout'].map((name) => [
          name,
          'readonly',
        ]),
      ),
    },
  },
  ...tseslint.configs.recommended,
  { ...solid, files: ['**/*.tsx'] },
  {
    files: ['**/*.tsx'],
    rules: {
      // `run` and `onRun` take deferred commands that read the current props when they run
      // (after a click or submit), which is what we want. See docs/plan/lint-disables.md.
      'solid/reactivity': ['warn', { customReactiveFunctions: ['run', 'onRun'] }],
    },
  },
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    rules: { 'max-lines': ['error', 400] },
  },
);
