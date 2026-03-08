import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  resolve: {
    extensions: ['.web.tsx', '.web.ts', '.tsx', '.ts', '.jsx', '.js'],
    alias: {
      '@semblance/ui': resolve(__dirname, '../semblance-ui'),
    },
    // Force single instance — pnpm hoists two i18next versions (v23 for semblance-ui, v24 for desktop).
    // Without dedup, config loads resources into one singleton, useTranslation reads from another.
    dedupe: ['i18next', 'react-i18next', 'react', 'react-dom'],
  },
  build: {
    target: 'esnext',
    minify: !process.env['TAURI_DEBUG'] ? 'esbuild' : false,
    sourcemap: !!process.env['TAURI_DEBUG'],
  },
});
