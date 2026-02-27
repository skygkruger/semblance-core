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
};

export default config;
