import type { Meta, StoryObj } from '@storybook/react';
import { PrivacyDashboard } from './PrivacyDashboard';

const meta: Meta<typeof PrivacyDashboard> = {
  title: 'Components/PrivacyDashboard',
  component: PrivacyDashboard,
  parameters: {
    backgrounds: {
      default: 'void',
      values: [{ name: 'void', value: '#0B0E11' }],
    },
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 560, width: '100%', padding: 24 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof PrivacyDashboard>;

export const Default: Story = {
  args: {
    dataSources: 7,
    cloudConnections: 0,
    actionsLogged: 847,
    timeSavedHours: 23,
    networkEntries: [
      { label: 'Outbound connections today', value: '0', isZero: true },
      { label: 'Gateway requests (authorized)', value: '34' },
      { label: 'Blocked connection attempts', value: '0', isZero: true },
    ],
    auditEntries: [
      { status: 'completed', text: 'Sent weekly digest email', domain: 'Email', timestamp: '08:12' },
      { status: 'completed', text: 'Fetched bank transactions', domain: 'Finance', timestamp: '07:00' },
      { status: 'pending', text: 'Cancel Figma subscription', domain: 'Finance', timestamp: '08:45' },
    ],
    proofVerified: true,
  },
};

export const PostAudit: Story = {
  args: {
    dataSources: 12,
    cloudConnections: 0,
    actionsLogged: 2341,
    timeSavedHours: 67,
    networkEntries: [
      { label: 'Outbound connections (30 days)', value: '0', isZero: true },
      { label: 'Gateway requests (30 days)', value: '1,247' },
      { label: 'Anomaly detections', value: '0', isZero: true },
    ],
    auditEntries: [
      { status: 'completed', text: 'Monthly privacy audit completed', domain: 'System', timestamp: 'Feb 26' },
      { status: 'completed', text: 'Audit hash chain verified — 2,341 entries intact', domain: 'System', timestamp: 'Feb 26' },
    ],
    proofVerified: true,
  },
};

export const Mobile: Story = {
  args: {
    dataSources: 7,
    cloudConnections: 0,
    actionsLogged: 847,
    timeSavedHours: 23,
    networkEntries: [
      { label: 'Outbound connections', value: '0', isZero: true },
    ],
    proofVerified: true,
  },
  parameters: {
    viewport: { defaultViewport: 'mobile' },
    backgrounds: { default: 'void' },
  },
  decorators: [
    (Story) => (
      <div style={{ width: '100%', padding: 16 }}>
        <Story />
      </div>
    ),
  ],
};
