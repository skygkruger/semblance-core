import type { Meta, StoryObj } from '@storybook/react';
import { ConnectionsScreen } from './ConnectionsScreen';
import type { ConnectorEntry } from './ConnectionsScreen';

const meta: Meta<typeof ConnectionsScreen> = {
  title: 'Screens/ConnectionsScreen',
  component: ConnectionsScreen,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'void', values: [{ name: 'void', value: '#0B0E11' }] },
  },
  decorators: [
    (Story) => (
      <div style={{ background: '#0B0E11', minHeight: '100vh', width: '100%' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ConnectionsScreen>;

const noop = () => {};

const allConnectors: ConnectorEntry[] = [
  // Native
  { id: 'imessage', displayName: 'iMessage', description: 'Read-only access to local message database', status: 'disconnected', category: 'native', isPremium: false, platform: 'macos', iconType: 'messages' },
  { id: 'apple-health', displayName: 'Apple Health', description: 'Import health metrics and activity data', status: 'disconnected', category: 'native', isPremium: true, platform: 'macos', iconType: 'health' },
  { id: 'apple-calendar', displayName: 'Apple Calendar', description: 'Local calendar events via CalDAV', status: 'disconnected', category: 'native', isPremium: false, platform: 'macos', iconType: 'calendar' },
  { id: 'apple-contacts', displayName: 'Apple Contacts', description: 'Local contacts database', status: 'disconnected', category: 'native', isPremium: false, platform: 'macos', iconType: 'contacts' },
  { id: 'local-files', displayName: 'Local Files', description: 'Index documents, PDFs, and text files', status: 'disconnected', category: 'native', isPremium: false, platform: 'all', iconType: 'files' },
  // OAuth
  { id: 'gmail', displayName: 'Gmail', description: 'Email threads, labels, and attachments', status: 'disconnected', category: 'oauth', isPremium: false, platform: 'all', iconType: 'email' },
  { id: 'google-calendar', displayName: 'Google Calendar', description: 'Calendar events and scheduling', status: 'disconnected', category: 'oauth', isPremium: false, platform: 'all', iconType: 'calendar' },
  { id: 'spotify', displayName: 'Spotify', description: 'Listening history and saved tracks', status: 'disconnected', category: 'oauth', isPremium: true, platform: 'all', iconType: 'music' },
  { id: 'github', displayName: 'GitHub', description: 'Repositories, issues, and pull requests', status: 'disconnected', category: 'oauth', isPremium: false, platform: 'all', iconType: 'code' },
  { id: 'google-drive', displayName: 'Google Drive', description: 'Cloud documents and file metadata', status: 'disconnected', category: 'oauth', isPremium: true, platform: 'all', iconType: 'files' },
  // Manual
  { id: 'health-export', displayName: 'Apple Health Export', description: 'Import health data from XML export file', status: 'disconnected', category: 'manual', isPremium: false, platform: 'all', iconType: 'import' },
  { id: 'linkedin-export', displayName: 'LinkedIn Export', description: 'Import connections and messages from data export', status: 'disconnected', category: 'manual', isPremium: false, platform: 'all', iconType: 'import' },
  { id: 'twitter-archive', displayName: 'Twitter Archive', description: 'Import tweets and DMs from archive download', status: 'disconnected', category: 'manual', isPremium: false, platform: 'all', iconType: 'import' },
  { id: 'photos-export', displayName: 'Photos Export', description: 'Import photo metadata and location data', status: 'disconnected', category: 'manual', isPremium: true, platform: 'all', iconType: 'photos' },
  { id: 'bank-csv', displayName: 'Bank Statement (CSV/OFX)', description: 'Import transaction history from bank exports', status: 'disconnected', category: 'manual', isPremium: true, platform: 'all', iconType: 'finance' },
];

function withStatus(
  connectors: ConnectorEntry[],
  overrides: Record<string, Partial<ConnectorEntry>>,
): ConnectorEntry[] {
  return connectors.map((c) => ({
    ...c,
    ...(overrides[c.id] ?? {}),
  }));
}

export const AllDisconnected: Story = {
  args: {
    connectors: [],
    onConnect: noop,
    onDisconnect: noop,
    onSync: noop,
  },
};

export const SomeConnected: Story = {
  args: {
    connectors: withStatus(allConnectors, {
      'gmail': { status: 'connected', userEmail: 'sky@veridian.run', lastSyncedAt: new Date(Date.now() - 120000).toISOString() },
      'google-calendar': { status: 'connected', lastSyncedAt: new Date(Date.now() - 300000).toISOString() },
      'github': { status: 'connected', userEmail: 'skygkruger', lastSyncedAt: new Date(Date.now() - 3600000).toISOString() },
      'local-files': { status: 'connected', lastSyncedAt: new Date(Date.now() - 900000).toISOString() },
      'apple-contacts': { status: 'connected', lastSyncedAt: new Date(Date.now() - 7200000).toISOString() },
    }),
    onConnect: noop,
    onDisconnect: noop,
    onSync: noop,
  },
};

export const AllConnected: Story = {
  args: {
    connectors: allConnectors.map((c) => ({
      ...c,
      status: 'connected' as const,
      lastSyncedAt: new Date(Date.now() - Math.random() * 7200000).toISOString(),
    })),
    onConnect: noop,
    onDisconnect: noop,
    onSync: noop,
  },
};

export const Mobile: Story = {
  args: { ...SomeConnected.args },
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
};
