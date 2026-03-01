import type { Meta, StoryObj } from '@storybook/react';
import { AgentInput } from './AgentInput';

const meta: Meta<typeof AgentInput> = {
  title: 'Components/AgentInput',
  component: AgentInput,
  parameters: { layout: 'centered' },
  decorators: [(Story) => <div style={{ width: '100%', maxWidth: 480 }}><Story /></div>],
};

export default meta;
type Story = StoryObj<typeof AgentInput>;

export const Empty: Story = {
  args: {},
};

export const Focused: Story = {
  render: () => {
    return <AgentInput autoFocus />;
  },
};

export const WithValue: Story = {
  render: () => {
    return <AgentInput />;
  },
};

export const Thinking: Story = {
  args: { thinking: true },
};

export const WithActiveDocument: Story = {
  args: { activeDocument: { name: 'taxes-2025.pdf', onDismiss: () => {} } },
};

export const Mobile: Story = {
  args: {},
  parameters: { viewport: { defaultViewport: 'mobile' } },
  decorators: [
    (Story) => (
      <div style={{ width: '100%', maxWidth: 390, padding: 16, boxSizing: 'border-box' as const }}>
        <Story />
      </div>
    ),
  ],
};

/* ─── Voice stories ─── */

export const VoiceIdle: Story = {
  args: {
    voiceEnabled: true,
    voiceState: 'idle',
  },
};

export const VoiceListening: Story = {
  args: {
    voiceEnabled: true,
    voiceState: 'listening',
    audioLevel: 0.6,
  },
};

export const VoiceProcessing: Story = {
  args: {
    voiceEnabled: true,
    voiceState: 'processing',
  },
};

export const VoiceSpeaking: Story = {
  args: {
    voiceEnabled: true,
    voiceState: 'speaking',
  },
};

export const VoiceError: Story = {
  args: {
    voiceEnabled: true,
    voiceState: 'error',
  },
};

export const VoiceDisabled: Story = {
  args: {
    voiceEnabled: false,
  },
};
