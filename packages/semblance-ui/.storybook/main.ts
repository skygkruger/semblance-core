import path from 'node:path';
import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: [
    '../components/**/*.stories.tsx',
    '../stories/**/*.stories.tsx',
    '../pages/**/*.stories.tsx',
    '../../desktop/src/components/**/*.stories.tsx',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  core: {
    disableTelemetry: true,
  },
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-a11y',
  ],
  staticDirs: ['../public'],
  async viteFinal(config) {
    config.resolve = config.resolve || {};
    // Resolve @semblance/ui to source so desktop stories work without a build step.
    config.resolve.alias = {
      ...config.resolve.alias,
      '@semblance/ui': path.resolve(__dirname, '../index.ts'),
    };

    // Prefer .web.tsx/.web.ts so bare imports (e.g. './Button') resolve to
    // the web variant (Button.web.tsx) when both .web.tsx and .native.tsx exist.
    config.resolve.extensions = [
      '.web.tsx', '.web.ts',
      '.tsx', '.ts',
      '.jsx', '.js',
      '.json',
    ];

    // Mock desktop platform-specific modules for Storybook rendering.
    // Desktop components import from Tauri IPC, React context, and core
    // modules that are unavailable in the Storybook web environment.
    const mocksDir = path.resolve(__dirname, '__mocks__');

    config.plugins = config.plugins || [];
    config.plugins.push({
      name: 'desktop-storybook-mocks',
      enforce: 'pre' as const,
      resolveId(source: string, importer: string | undefined) {
        if (!importer) return null;
        const normalized = importer.replace(/\\/g, '/');
        const isDesktop = normalized.includes('/desktop/src/');

        if (isDesktop) {
          switch (source) {
            case '../ipc/commands':
              return path.resolve(mocksDir, 'desktop-ipc-commands.ts');
            case '../state/AppState':
              return path.resolve(mocksDir, 'desktop-app-state.ts');
            case '../sound/SoundEngineContext':
              return path.resolve(mocksDir, 'desktop-sound-context.ts');
          }
          if (source.endsWith('core/knowledge/connector-category-map')) {
            return path.resolve(mocksDir, 'core-connector-category-map.ts');
          }
        }

        if (source === '@semblance/core/sound/sound-types') {
          return path.resolve(mocksDir, 'core-sound-types.ts');
        }

        return null;
      },
    });

    return config;
  },
};

export default config;
