import type { Meta, StoryObj } from '@storybook/react';
import { SettingsConnections } from './SettingsConnections';

const meta: Meta<typeof SettingsConnections> = {
  title: 'Settings/SettingsConnections',
  component: SettingsConnections,
  parameters: {
    backgrounds: { default: 'void', values: [{ name: 'void', value: '#0B0E11' }] },
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof SettingsConnections>;

const allConnections = [
  { id: 'email', name: 'Email (IMAP)', category: 'communication', categoryColor: '#6ECFA3', isConnected: true, lastSync: '2m ago', entityCount: 4821 },
  { id: 'calendar', name: 'Calendar (CalDAV)', category: 'scheduling', categoryColor: '#C9A85C', isConnected: true, lastSync: '5m ago', entityCount: 342 },
  { id: 'contacts', name: 'Contacts', category: 'people', categoryColor: '#8593A4', isConnected: true, lastSync: '1h ago', entityCount: 1203 },
  { id: 'files', name: 'Local Files', category: 'documents', categoryColor: '#A8B4C0', isConnected: true, lastSync: '15m ago', entityCount: 892 },
  { id: 'notes', name: 'Notes (Obsidian)', category: 'documents', categoryColor: '#A8B4C0', isConnected: false, lastSync: null, entityCount: 0 },
  { id: 'health', name: 'Apple Health', category: 'health', categoryColor: '#C97B6E', isConnected: false, lastSync: null, entityCount: 0 },
];

export const MixedConnections: Story = {
  args: {
    connections: allConnections,
    onManageAll: () => console.log('Manage all'),
    onConnectionTap: (id) => console.log('Tap:', id),
    onBack: () => console.log('Back'),
  },
};

export const AllConnected: Story = {
  args: {
    connections: allConnections.map((c) => ({ ...c, isConnected: true, lastSync: '2m ago', entityCount: c.entityCount || 100 })),
    onManageAll: () => console.log('Manage all'),
    onConnectionTap: (id) => console.log('Tap:', id),
    onBack: () => console.log('Back'),
  },
};

export const NoneConnected: Story = {
  args: {
    connections: [],
    onManageAll: () => console.log('Manage all'),
    onConnectionTap: (id) => console.log('Tap:', id),
    onBack: () => console.log('Back'),
  },
};

export const Mobile: Story = {
  args: { ...MixedConnections.args },
  parameters: {
    viewport: { defaultViewport: 'mobile' },
  },
};
