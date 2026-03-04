import type { Meta, StoryObj } from '@storybook/react';
import { ChatInput } from './ChatInput';

const meta: Meta<typeof ChatInput> = {
  title: 'Chat/ChatInput',
  component: ChatInput,
  decorators: [
    (Story) => (
      <div style={{ width: '100%', maxWidth: 600 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ChatInput>;

export const Default: Story = {
  args: {
    onSend: () => {},
  },
};

export const WithAttachButton: Story = {
  args: {
    onSend: () => {},
    onAttach: () => {},
  },
};

export const CustomPlaceholder: Story = {
  args: {
    onSend: () => {},
    placeholder: 'Ask about your finances...',
  },
};

export const Disabled: Story = {
  args: {
    onSend: () => {},
    disabled: true,
    placeholder: 'Semblance is thinking...',
  },
};

export const Mobile: Story = {
  args: {
    onSend: () => {},
    onAttach: () => {},
  },
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
};
