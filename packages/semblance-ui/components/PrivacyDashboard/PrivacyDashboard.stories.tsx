import type { Meta, StoryObj } from '@storybook/react';
import { PrivacyDashboard } from './PrivacyDashboard';
import { DotMatrix } from '../DotMatrix/DotMatrix';

const meta: Meta<typeof PrivacyDashboard> = {
  title: 'Components/PrivacyDashboard',
  component: PrivacyDashboard,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ position: 'relative', width: '100vw', minHeight: '100vh', background: '#0B0E11', overflow: 'hidden' }}>
        <DotMatrix />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'center', padding: 24, minHeight: '100vh' }}>
          <div style={{ maxWidth: 560, width: '100%' }}>
            <Story />
          </div>
        </div>
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
    chainIntegrity: {
      verified: true,
      entryCount: 847,
      daysVerified: 23,
    },
    keySecurity: {
      hardwareBacked: true,
      backend: 'Secure Enclave',
      publicKeyFingerprint: 'a1b2c3d4e5f60718',
    },
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
    onExportReceipt: () => console.log('Export receipt clicked'),
  },
};

export const PostAudit: Story = {
  args: {
    dataSources: 12,
    cloudConnections: 0,
    actionsLogged: 2341,
    timeSavedHours: 67,
    chainIntegrity: {
      verified: true,
      entryCount: 2341,
      daysVerified: 67,
    },
    keySecurity: {
      hardwareBacked: false,
      backend: 'software',
      publicKeyFingerprint: 'f1e2d3c4b5a69078',
    },
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
  },
};
