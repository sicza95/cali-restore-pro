import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { offlineShell } from './src/app/offline-shell';

export default defineConfig({
  optimizeDeps: {
    include: [
      'polygon-clipping',
      '@hpke/core',
      'solid-js/store',
      'libheif-js/libheif-wasm/libheif-bundle.mjs',
    ],
  },
  worker: { format: 'es' },
  plugins: [solid(), offlineShell()],
  // Synthetic Storybook photographs never ship in the product bundle.
  publicDir: false,
});
