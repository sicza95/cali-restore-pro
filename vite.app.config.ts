import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid()],
  // Synthetic Storybook photographs never ship in the product bundle.
  publicDir: false,
});
