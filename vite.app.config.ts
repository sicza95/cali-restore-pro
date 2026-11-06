import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { offlineShell } from './src/app/offline-shell';

export default defineConfig({
  plugins: [solid(), offlineShell()],
  // Synthetic Storybook photographs never ship in the product bundle.
  publicDir: false,
});
