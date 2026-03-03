import type { Meta, StoryObj } from '@storybook/react';
import { DataSourcesStep } from './DataSourcesStep';

const meta: Meta<typeof DataSourcesStep> = {
  title: 'Onboarding/DataSourcesStep',
  component: DataSourcesStep,
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
type Story = StoryObj<typeof DataSourcesStep>;

export const Default: Story = {
  args: {
    onContinue: () => {},
    onSkip: () => {},
  },
};

export const SomeConnected: Story = {
  args: {
    initialConnected: new Set(['email', 'calendar']),
    onContinue: () => {},
    onSkip: () => {},
  },
};

export const AllConnected: Story = {
  args: {
    initialConnected: new Set(['email', 'calendar', 'files', 'contacts', 'health', 'slack']),
    onContinue: () => {},
    onSkip: () => {},
  },
};

export const Mobile: Story = {
  args: {
    onContinue: () => {},
    onSkip: () => {},
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
