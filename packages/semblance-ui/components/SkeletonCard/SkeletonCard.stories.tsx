import type { Meta, StoryObj } from '@storybook/react';
import { SkeletonCard } from './SkeletonCard';

const DarkDecorator = (Story: React.ComponentType) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: '#0B0E11',
    padding: 40,
  }}>
    <div style={{ width: 480 }}>
      <Story />
    </div>
  </div>
);

const meta: Meta<typeof SkeletonCard> = {
  title: 'Components/SkeletonCard',
  component: SkeletonCard,
  parameters: { layout: 'fullscreen' },
  decorators: [DarkDecorator],
  argTypes: {
    variant: {
      control: 'select',
      options: ['inference', 'indexing', 'briefing', 'generic'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof SkeletonCard>;

export const InferenceState: Story = {
  args: { variant: 'inference' },
};

export const IndexingState: Story = {
  args: { variant: 'indexing' },
};

export const BriefingState: Story = {
  args: { variant: 'briefing' },
};

export const NoSpinner: Story = {
  args: { variant: 'generic', showSpinner: false, message: 'Connecting...' },
};

export const Tall: Story = {
  args: { variant: 'inference', height: 320 },
};
