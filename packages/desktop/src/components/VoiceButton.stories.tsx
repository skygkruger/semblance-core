import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '@semblance/ui';
import { VoiceButton } from './VoiceButton';

const VoidDecorator = (Story: React.ComponentType) => (
  <div style={{ position: 'relative', minHeight: '100vh', background: '#0B0E11', padding: 32 }}>
    <DotMatrix />
    <div style={{ position: 'relative', zIndex: 1 }}>
      <Story />
    </div>
  </div>
);

const meta: Meta<typeof VoiceButton> = {
  title: 'Desktop/Voice/VoiceButton',
  component: VoiceButton,
  parameters: { layout: 'centered' },
  decorators: [VoidDecorator],
};

export default meta;
type Story = StoryObj<typeof VoiceButton>;

export const Idle: Story = {
  args: {
    state: 'idle',
    onClick: () => {},
  },
};

export const Listening: Story = {
  args: {
    state: 'listening',
    onClick: () => {},
  },
};

export const Processing: Story = {
  args: {
    state: 'processing',
    onClick: () => {},
  },
};

export const Thinking: Story = {
  args: {
    state: 'thinking',
    onClick: () => {},
  },
};

export const Speaking: Story = {
  args: {
    state: 'speaking',
    onClick: () => {},
  },
};

export const Error: Story = {
  args: {
    state: 'error',
    onClick: () => {},
  },
};

export const DisabledIdle: Story = {
  args: {
    state: 'idle',
    onClick: () => {},
    disabled: true,
  },
};
