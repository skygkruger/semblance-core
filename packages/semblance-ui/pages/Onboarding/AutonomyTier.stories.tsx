import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { AutonomyTier } from './AutonomyTier';
import type { AutonomyTier as AutonomyTierType } from '../../components/AutonomySelector/AutonomySelector.types';

const meta: Meta<typeof AutonomyTier> = {
  title: 'Onboarding/AutonomyTier',
  component: AutonomyTier,
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
type Story = StoryObj<typeof AutonomyTier>;

export const Guardian: Story = {
  args: {
    value: 'guardian',
    onChange: () => {},
    onContinue: () => {},
  },
};

export const Partner: Story = {
  args: {
    value: 'partner',
    onChange: () => {},
    onContinue: () => {},
  },
};

export const AlterEgo: Story = {
  args: {
    value: 'alter_ego',
    onChange: () => {},
    onContinue: () => {},
  },
};

export const Interactive: Story = {
  render: function InteractiveStory() {
    const [value, setValue] = useState<AutonomyTierType>('partner');
    return <AutonomyTier value={value} onChange={setValue} onContinue={() => {}} />;
  },
};

export const Mobile: Story = {
  args: {
    value: 'partner',
    onChange: () => {},
    onContinue: () => {},
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
