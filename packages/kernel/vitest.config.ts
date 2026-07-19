import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@semblance/gateway': resolve(__dirname, '../gateway'),
      '@semblance/core': resolve(__dirname, '../core'),
      '@semblance/protocol': resolve(__dirname, '../protocol'),
    },
  },
});
