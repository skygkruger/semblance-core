import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    testTimeout: 10000,
    setupFiles: ['./tests/setup/dom-setup.ts'],
  },
  resolve: {
    extensions: ['.web.tsx', '.web.ts', '.tsx', '.ts', '.jsx', '.js', '.json'],
    alias: {
      '@semblance/core': resolve(__dirname, 'packages/core'),
      '@semblance/gateway': resolve(__dirname, 'packages/gateway'),
      '@semblance/ui': resolve(__dirname, 'packages/semblance-ui'),
      '@semblance/desktop': resolve(__dirname, 'packages/desktop/src'),
      '@tauri-apps/api/core': resolve(__dirname, 'tests/helpers/mock-tauri.ts'),
      '@tauri-apps/api/event': resolve(__dirname, 'tests/helpers/mock-tauri-event.ts'),
      '@tauri-apps/plugin-dialog': resolve(__dirname, 'tests/helpers/mock-tauri-dialog.ts'),
      '@semblance/mobile': resolve(__dirname, 'packages/mobile/src'),
      'react-native': resolve(__dirname, 'tests/helpers/mock-react-native.ts'),
      '@react-navigation/native-stack': resolve(__dirname, 'tests/helpers/mock-react-navigation.ts'),
      'react-i18next': resolve(__dirname, 'packages/desktop/node_modules/react-i18next'),
      'i18next': resolve(__dirname, 'packages/desktop/node_modules/i18next'),
      'react-router-dom': resolve(__dirname, 'packages/desktop/node_modules/react-router-dom'),
    },
  },
});
