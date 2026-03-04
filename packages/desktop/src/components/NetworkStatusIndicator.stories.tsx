import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '@semblance/ui';
import { NetworkStatusIndicator } from './NetworkStatusIndicator';

const VoidDecorator = (Story: React.ComponentType) => (
  <div style={{ position: 'relative', minHeight: '100vh', background: '#0B0E11', padding: 32 }}>
    <DotMatrix />
    <div style={{ position: 'relative', zIndex: 1 }}>
      <Story />
    </div>
  </div>
);

const meta: Meta<typeof NetworkStatusIndicator> = {
  title: 'Desktop/Network/NetworkStatusIndicator',
  component: NetworkStatusIndicator,
  parameters: { layout: 'centered' },
  decorators: [VoidDecorator],
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
