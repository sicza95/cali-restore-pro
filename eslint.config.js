import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import solid from 'eslint-plugin-solid/configs/typescript';

export default tseslint.config(
  {
    ignores: [
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
);
