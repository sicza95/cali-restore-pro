import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: './contracts/openapi.json',
  output: { path: 'src/platform/api', postProcess: ['prettier'] },
  plugins: ['@hey-api/typescript'],
});
