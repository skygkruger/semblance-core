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
  args: { placeholder: 'Type here to see Veridian focus ring...' },
};

export const WithValue: Story = {
  render: () => {
    // Story demonstrates the component — value is internal state
    return <AgentInput placeholder="Cancel my Figma subscription" />;
  },
};

export const Thinking: Story = {
  args: { thinking: true },
};

export const WithActiveDocument: Story = {
  args: { activeDocument: 'taxes-2025.pdf' },
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
