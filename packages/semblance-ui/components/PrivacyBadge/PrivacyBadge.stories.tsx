import type { Meta, StoryObj } from '@storybook/react';
import { PrivacyBadge } from './PrivacyBadge';

const meta: Meta<typeof PrivacyBadge> = {
  title: 'Components/PrivacyBadge',
  component: PrivacyBadge,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof PrivacyBadge>;

export const Active: Story = {
  args: { status: 'active' },
};

export const Syncing: Story = {
  args: { status: 'syncing' },
};

export const Offline: Story = {
  args: { status: 'offline' },
};

export const OverlayPlacement: Story = {
  render: () => (
    <div style={{ position: 'relative', width: 300, height: 200, background: 'var(--s1)', borderRadius: 'var(--r-lg)', padding: 16 }}>
      <div style={{ position: 'absolute', bottom: 16, left: 16 }}>
        <PrivacyBadge status="active" />
      </div>
    </div>
  ),
};
