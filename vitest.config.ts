import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@semblance/core': resolve(__dirname, 'packages/core'),
      '@semblance/gateway': resolve(__dirname, 'packages/gateway'),
    },
  },
});
