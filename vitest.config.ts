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
      if (!source.endsWith('.js')) return null;
      if (source.startsWith('@semblance/core/')) {
        const subpath = source.slice('@semblance/core/'.length);
        const jsPath = resolve(__dirname, 'packages/core', subpath);
        const tsPath = jsPath.replace(/\.js$/, '.ts');
        if (existsSync(tsPath)) return tsPath;
        const tsxPath = jsPath.replace(/\.js$/, '.tsx');
        if (existsSync(tsxPath)) return tsxPath;
      }
      // Resolve relative .js imports to .ts/.tsx source when both exist
      if (source.startsWith('.') && importer) {
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
  define: {
    'process.env.NODE_ENV': '"test"',
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'packages/*/tests/**/*.test.ts'],
    testTimeout: 10000,
    setupFiles: ['./tests/setup/dom-setup.ts'],
  },
  resolve: {
    extensions: ['.web.tsx', '.web.ts', '.tsx', '.ts', '.jsx', '.js', '.json'],
    alias: [
      {
        find: /^@semblance\/core\/(.+)\.js$/,
        replacement: `${resolve(__dirname, 'packages/core')}/$1.ts`,
      },
      { find: '@semblance/core', replacement: resolve(__dirname, 'packages/core') },
      { find: '@semblance/vault', replacement: resolve(__dirname, 'packages/vault') },
      { find: '@semblance/protocol', replacement: resolve(__dirname, 'packages/protocol') },
      { find: '@semblance/extension-sdk', replacement: resolve(__dirname, 'packages/extension-sdk/src/index.ts') },
      { find: '@semblance/extension-runner', replacement: resolve(__dirname, 'packages/extension-runner/src/index.ts') },
      { find: '@semblance/gateway', replacement: resolve(__dirname, 'packages/gateway') },
      { find: '@semblance/kernel', replacement: resolve(__dirname, 'packages/kernel/src/index.ts') },
      { find: '@semblance/proof', replacement: resolve(__dirname, 'packages/proof/src/index.ts') },
      { find: '@semblance/ui', replacement: resolve(__dirname, 'packages/semblance-ui') },
      { find: '@semblance/desktop', replacement: resolve(__dirname, 'packages/desktop/src') },
      { find: '@tauri-apps/api/core', replacement: resolve(__dirname, 'tests/helpers/mock-tauri.ts') },
      { find: '@tauri-apps/api/event', replacement: resolve(__dirname, 'tests/helpers/mock-tauri-event.ts') },
      { find: '@tauri-apps/plugin-dialog', replacement: resolve(__dirname, 'tests/helpers/mock-tauri-dialog.ts') },
      { find: '@semblance/mobile', replacement: resolve(__dirname, 'packages/mobile/src') },
      { find: 'react-native', replacement: resolve(__dirname, 'tests/helpers/mock-react-native.ts') },
      { find: '@react-navigation/native-stack', replacement: resolve(__dirname, 'tests/helpers/mock-react-navigation.ts') },
      { find: '@react-navigation/native', replacement: resolve(__dirname, 'tests/helpers/mock-react-navigation-native.ts') },
      { find: 'react-native-fs', replacement: resolve(__dirname, 'tests/helpers/mock-react-native-fs.ts') },
      { find: 'react-native-webview', replacement: resolve(__dirname, 'tests/helpers/mock-react-native-webview.ts') },
      { find: '@op-engineering/op-sqlite', replacement: resolve(__dirname, 'tests/helpers/mock-op-sqlite.ts') },
      { find: 'react-native-device-info', replacement: resolve(__dirname, 'tests/helpers/mock-device-info.ts') },
      { find: '@notifee/react-native', replacement: resolve(__dirname, 'tests/helpers/mock-notifee.ts') },
      { find: 'react-native-quick-crypto', replacement: resolve(__dirname, 'tests/helpers/mock-quick-crypto.ts') },
      { find: 'react-i18next', replacement: resolve(__dirname, 'packages/desktop/node_modules/react-i18next') },
      { find: 'i18next', replacement: resolve(__dirname, 'packages/desktop/node_modules/i18next') },
      { find: 'react-router-dom', replacement: resolve(__dirname, 'packages/desktop/node_modules/react-router-dom') },
    ],
  },
});
