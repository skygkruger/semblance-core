import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

// Vitest plugin: when a .js import resolves to a file that has a .ts sibling,
// redirect to the .ts source. This prevents test/source module split when
// compiled .js artifacts coexist with .ts source (tsc --build output).
function preferTsOverJs() {
  return {
    name: 'prefer-ts-over-js',
    enforce: 'pre' as const,
    resolveId(source: string, importer: string | undefined) {
      if (!importer || !source.endsWith('.js')) return null;
      // Resolve relative .js imports to .ts/.tsx source when both exist
      if (source.startsWith('.')) {
        const dir = importer.substring(0, Math.max(importer.lastIndexOf('/'), importer.lastIndexOf('\\')));
        const jsPath = resolve(dir, source);
        // Try .ts first, then .tsx
        const tsPath = jsPath.replace(/\.js$/, '.ts');
        if (existsSync(tsPath)) return tsPath;
        const tsxPath = jsPath.replace(/\.js$/, '.tsx');
        if (existsSync(tsxPath)) return tsxPath;
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [preferTsOverJs()],
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
      '@react-navigation/native': resolve(__dirname, 'tests/helpers/mock-react-navigation-native.ts'),
      'react-native-fs': resolve(__dirname, 'tests/helpers/mock-react-native-fs.ts'),
      'react-native-webview': resolve(__dirname, 'tests/helpers/mock-react-native-webview.ts'),
      '@op-engineering/op-sqlite': resolve(__dirname, 'tests/helpers/mock-op-sqlite.ts'),
      'react-native-device-info': resolve(__dirname, 'tests/helpers/mock-device-info.ts'),
      '@notifee/react-native': resolve(__dirname, 'tests/helpers/mock-notifee.ts'),
      'react-native-quick-crypto': resolve(__dirname, 'tests/helpers/mock-quick-crypto.ts'),
      'react-i18next': resolve(__dirname, 'packages/desktop/node_modules/react-i18next'),
      'i18next': resolve(__dirname, 'packages/desktop/node_modules/i18next'),
      'react-router-dom': resolve(__dirname, 'packages/desktop/node_modules/react-router-dom'),
    },
  },
});
