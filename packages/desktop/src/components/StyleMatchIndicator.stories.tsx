import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '@semblance/ui';
import { StyleMatchIndicator } from './StyleMatchIndicator';

const VoidDecorator = (Story: React.ComponentType) => (
  <div style={{ position: 'relative', minHeight: '100vh', background: '#0B0E11', padding: 32 }}>
    <DotMatrix />
    <div style={{ position: 'relative', zIndex: 1 }}>
      <Story />
    </div>
  </div>
);

const meta: Meta<typeof StyleMatchIndicator> = {
  title: 'Desktop/Style/StyleMatchIndicator',
  component: StyleMatchIndicator,
  parameters: { layout: 'centered' },
  decorators: [VoidDecorator],
};

export default meta;
type Story = StoryObj<typeof StyleMatchIndicator>;

export const HighMatch: Story = {
  args: {
    score: 87,
    breakdown: { greeting: 92, signoff: 85, sentenceLength: 80, formality: 90, vocabulary: 88 },
  },
};

export const MediumMatch: Story = {
  args: {
    score: 64,
    breakdown: { greeting: 78, signoff: 55, sentenceLength: 70, formality: 60, vocabulary: 58 },
  },
};

export const LowMatch: Story = {
  args: {
    score: 38,
    breakdown: { greeting: 45, signoff: 30, sentenceLength: 50, formality: 35, vocabulary: 32 },
  },
};

export const LearningInProgress: Story = {
  args: {
    score: null,
    emailsAnalyzed: 8,
    activationThreshold: 20,
  },
};
