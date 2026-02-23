import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    testTimeout: 10000,
    setupFiles: ['./tests/setup/dom-setup.ts'],
  },
  resolve: {
    alias: {
      '@semblance/core': resolve(__dirname, 'packages/core'),
      '@semblance/gateway': resolve(__dirname, 'packages/gateway'),
      '@semblance/ui': resolve(__dirname, 'packages/semblance-ui'),
      '@semblance/desktop': resolve(__dirname, 'packages/desktop/src'),
      '@tauri-apps/api/core': resolve(__dirname, 'tests/helpers/mock-tauri.ts'),
      '@tauri-apps/plugin-dialog': resolve(__dirname, 'tests/helpers/mock-tauri-dialog.ts'),
    },
  },
});
