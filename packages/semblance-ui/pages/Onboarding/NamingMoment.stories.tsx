import type { Meta, StoryObj } from '@storybook/react';
import { NamingMoment } from './NamingMoment';

const meta: Meta<typeof NamingMoment> = {
  title: 'Onboarding/NamingMoment',
  component: NamingMoment,
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
type Story = StoryObj<typeof NamingMoment>;

export const Default: Story = {
  args: {
    onComplete: () => {},
  },
};

export const WithDefaultValue: Story = {
  args: {
    onComplete: () => {},
    defaultValue: 'Sky',
  },
};

export const Mobile: Story = {
  args: {
    onComplete: () => {},
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
