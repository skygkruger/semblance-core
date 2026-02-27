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
  args: { placeholder: 'Ask Semblance' },
};

export const Focused: Story = {
  args: {
    placeholder: 'Type here to see Veridian focus ring...',
    autoFocus: true,
  },
};

export const WithValue: Story = {
  render: () => {
    return <AgentInput placeholder="Cancel my Figma subscription" />;
  },
};

export const Thinking: Story = {
  args: { thinking: true },
};

export const WithActiveDocument: Story = {
  args: { activeDocument: { name: 'taxes-2025.pdf', onDismiss: () => {} } },
};

export const Mobile: Story = {
  args: { placeholder: 'Ask Semblance' },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  decorators: [
    (Story) => (
      <div style={{ width: '100%', maxWidth: 390, padding: 16, boxSizing: 'border-box' as const }}>
        <Story />
      </div>
    ),
  ],
};
