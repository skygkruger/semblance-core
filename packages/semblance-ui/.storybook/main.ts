import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: [
    '../components/**/*.stories.tsx',
    '../stories/**/*.stories.tsx',
    '../pages/**/*.stories.tsx',
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
    // Prefer .web.tsx/.web.ts so bare imports (e.g. './Button') resolve to
    // the web variant (Button.web.tsx) when both .web.tsx and .native.tsx exist.
    config.resolve.extensions = [
      '.web.tsx', '.web.ts',
      '.tsx', '.ts',
      '.jsx', '.js',
      '.json',
    ];
    return config;
  },
};

export default config;
