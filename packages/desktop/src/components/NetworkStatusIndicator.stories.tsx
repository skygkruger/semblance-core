import type { Meta, StoryObj } from '@storybook/react';
import { NetworkStatusIndicator } from './NetworkStatusIndicator';

const meta: Meta<typeof NetworkStatusIndicator> = {
  title: 'Desktop/Network/NetworkStatusIndicator',
  component: NetworkStatusIndicator,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: 240 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof NetworkStatusIndicator>;

// Uses mocked getNetworkTrustStatus from the Vite plugin.
// Default mock returns { clean: true, unauthorizedCount: 0, activeServiceCount: 0 }.
// This renders the green dot with "0 unauthorized" text.
export const CleanStatus: Story = {
  args: {
    onClick: () => {},
  },
};
