import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { AutonomySelector } from './AutonomySelector';
import { DotMatrix } from '../DotMatrix/DotMatrix';
import type { AutonomyTier } from './AutonomySelector.types';

const meta: Meta<typeof AutonomySelector> = {
  title: 'Components/AutonomySelector',
  component: AutonomySelector,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#0B0E11', overflow: 'hidden' }}>
        <DotMatrix />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40 }}>
          <div style={{ width: '100%', maxWidth: 440 }}>
            <Story />
          </div>
        </div>
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof AutonomySelector>;

export const Guardian: Story = {
  args: {
    value: 'guardian',
    onChange: () => {},
  },
};

export const Partner: Story = {
  args: {
    value: 'partner',
    onChange: () => {},
  },
};

export const AlterEgo: Story = {
  args: {
    value: 'alter_ego',
    onChange: () => {},
  },
};

export const Interactive: Story = {
  render: function InteractiveStory() {
    const [value, setValue] = useState<AutonomyTier>('partner');
    return <AutonomySelector value={value} onChange={setValue} />;
  },
};
