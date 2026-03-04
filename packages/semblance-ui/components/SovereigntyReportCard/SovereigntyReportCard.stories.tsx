import type { Meta, StoryObj } from '@storybook/react';
import { SovereigntyReportCard } from './SovereigntyReportCard';
import { DotMatrix } from '../DotMatrix/DotMatrix';

const meta: Meta<typeof SovereigntyReportCard> = {
  title: 'Components/SovereigntyReportCard',
  component: SovereigntyReportCard,
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
type Story = StoryObj<typeof SovereigntyReportCard>;

export const SovereigntyReportPreview: Story = {
  args: {
    periodStart: '2026-02-01T00:00:00.000Z',
    periodEnd: '2026-02-28T23:59:59.000Z',
    generatedAt: '2026-03-01T08:12:34.000Z',
    deviceId: 'macbook-pro-sky-2025',
    knowledgeSummary: {
      email: 1247,
      calendar: 89,
      documents: 342,
      contacts: 156,
      browser: 2891,
    },
    autonomousActions: {
      byDomain: {
        email: 234,
        calendar: 67,
        finance: 12,
        system: 45,
      },
      totalTimeSavedSeconds: 14400,
    },
    hardLimitsEnforced: 3,
    auditChainStatus: {
      verified: true,
      totalEntries: 2341,
      daysCovered: 28,
    },
    signatureVerified: true,
    publicKeyFingerprint: 'a1b2c3d4e5f60718',
    comparisonStatement:
      'During this period, Semblance sent zero bytes of your data to any cloud. ' +
      'Every action was signed and logged locally. Your knowledge graph contains 4,725 items. ' +
      '358 autonomous actions saved you approximately 4h 0m. ' +
      'A cloud AI would have sent your queries to remote servers for processing, ' +
      'stored your data on infrastructure you don\'t control, and used your interactions ' +
      'to train models that serve other people. This report was generated on your device, ' +
      'signed with your key, and is verifiable without contacting any server.',
    onExportPDF: () => console.log('Export PDF clicked'),
  },
};

export const SovereigntyReportEmpty: Story = {
  args: {
    periodStart: '2026-03-01T00:00:00.000Z',
    periodEnd: '2026-03-01T23:59:59.000Z',
    generatedAt: '2026-03-02T00:01:00.000Z',
    deviceId: 'new-device-001',
    knowledgeSummary: {},
    autonomousActions: {
      byDomain: {},
      totalTimeSavedSeconds: 0,
    },
    hardLimitsEnforced: 0,
    auditChainStatus: {
      verified: true,
      totalEntries: 0,
      daysCovered: 0,
    },
  },
};

export const SovereigntyReportGenerator: Story = {
  args: {
    periodStart: '2026-02-01T00:00:00.000Z',
    periodEnd: '2026-02-28T23:59:59.000Z',
    generatedAt: '2026-03-01T08:12:34.000Z',
    deviceId: 'loading',
    knowledgeSummary: {},
    autonomousActions: {
      byDomain: {},
      totalTimeSavedSeconds: 0,
    },
    hardLimitsEnforced: 0,
    auditChainStatus: {
      verified: true,
      totalEntries: 0,
      daysCovered: 0,
    },
    loading: true,
  },
};
