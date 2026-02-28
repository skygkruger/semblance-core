import type { Meta, StoryObj } from '@storybook/react';
import { SettingsPrivacy } from './SettingsPrivacy';

const meta: Meta<typeof SettingsPrivacy> = {
  title: 'Settings/SettingsPrivacy',
  component: SettingsPrivacy,
  parameters: {
    backgrounds: { default: 'void', values: [{ name: 'void', value: '#0B0E11' }] },
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof SettingsPrivacy>;

const callbacks = {
  onRunAudit: () => console.log('Run audit'),
  onExportData: () => console.log('Export data'),
  onExportHistory: () => console.log('Export history'),
  onDeleteSourceData: (id: string) => console.log('Delete source:', id),
  onDeleteAllData: () => console.log('Delete all'),
  onResetSemblance: () => console.log('Reset'),
  onBack: () => console.log('Back'),
};

const dataSources = [
  { id: 'email', name: 'Email', entityCount: 4821, lastIndexed: '2m ago' },
  { id: 'calendar', name: 'Calendar', entityCount: 342, lastIndexed: '5m ago' },
  { id: 'files', name: 'Local Files', entityCount: 892, lastIndexed: '15m ago' },
  { id: 'contacts', name: 'Contacts', entityCount: 1203, lastIndexed: '1h ago' },
];

export const AuditClean: Story = {
  args: {
    lastAuditTime: 'Feb 28, 2026 · 08:12',
    auditStatus: 'clean',
    dataSources,
    ...callbacks,
  },
};

export const AuditReviewNeeded: Story = {
  args: {
    lastAuditTime: 'Feb 25, 2026 · 14:30',
    auditStatus: 'review-needed',
    dataSources,
    ...callbacks,
  },
};

export const NeverAudited: Story = {
  args: {
    lastAuditTime: null,
    auditStatus: 'never-run',
    dataSources: [],
    ...callbacks,
  },
};

export const Mobile: Story = {
  args: { ...AuditClean.args },
  parameters: {
    viewport: { defaultViewport: 'mobile' },
  },
};
