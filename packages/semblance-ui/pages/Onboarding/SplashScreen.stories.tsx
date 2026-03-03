import type { Meta, StoryObj } from '@storybook/react';
import { SplashScreen } from './SplashScreen';

const meta: Meta<typeof SplashScreen> = {
  title: 'Onboarding/SplashScreen',
  component: SplashScreen,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'void', values: [{ name: 'void', value: '#0B0E11' }] },
  },
  decorators: [
    (Story) => (
      <div style={{ background: '#0B0E11', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof SplashScreen>;

export const Default: Story = {
  args: {
    onBegin: () => {},
  },
};

export const WithAutoAdvance: Story = {
  args: {
    onBegin: () => {},
    autoAdvanceMs: 5000,
  },
};

export const Mobile: Story = {
  args: {
    onBegin: () => {},
  },
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [
    (Story) => (
      <div style={{ background: '#0B0E11', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, maxWidth: 390 }}>
        <Story />
      </div>
    ),
  ],
};
