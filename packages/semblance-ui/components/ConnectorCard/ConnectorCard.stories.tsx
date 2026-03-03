import type { Meta, StoryObj } from '@storybook/react';
import { ConnectorCard } from './ConnectorCard';
import { EnvelopeIcon, CalendarIcon, HeartIcon, DollarIcon } from '../ConnectionsScreen/ConnectorIcons';

const meta: Meta<typeof ConnectorCard> = {
  title: 'Components/ConnectorCard',
  component: ConnectorCard,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'void', values: [{ name: 'void', value: '#0B0E11' }] },
  },
  decorators: [
    (Story) => (
      <div style={{ background: '#0B0E11', padding: 40, width: '100%', maxWidth: 480 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ConnectorCard>;

export const Connected: Story = {
  args: {
    id: 'email',
    displayName: 'Email',
    description: 'IMAP inbox, sent mail, and drafts',
    status: 'connected',
    isPremium: false,
    userEmail: 'sky@veridian.run',
    lastSyncedAt: new Date(Date.now() - 900000).toISOString(),
    icon: <EnvelopeIcon size={16} />,
    onConnect: () => {},
    onDisconnect: () => {},
    onSync: () => {},
  },
};

export const Disconnected: Story = {
  args: {
    id: 'calendar',
    displayName: 'Calendar',
    description: 'CalDAV events and scheduling',
    status: 'disconnected',
    isPremium: false,
    icon: <CalendarIcon size={16} />,
    onConnect: () => {},
    onDisconnect: () => {},
    onSync: () => {},
  },
};

export const Pending: Story = {
  args: {
    id: 'health',
    displayName: 'Health',
    description: 'HealthKit sleep, activity, and vitals',
    status: 'pending',
    isPremium: false,
    icon: <HeartIcon size={16} />,
    onConnect: () => {},
    onDisconnect: () => {},
    onSync: () => {},
  },
};

export const ErrorState: Story = {
  args: {
    id: 'email',
    displayName: 'Email',
    description: 'IMAP inbox, sent mail, and drafts',
    status: 'error',
    isPremium: false,
    userEmail: 'sky@veridian.run',
    icon: <EnvelopeIcon size={16} />,
    onConnect: () => {},
    onDisconnect: () => {},
    onSync: () => {},
  },
};

export const DigitalRepresentative: Story = {
  args: {
    id: 'finance',
    displayName: 'Financial Accounts',
    description: 'Bank transactions, spending patterns, and recurring charges',
    status: 'disconnected',
    isPremium: true,
    icon: <DollarIcon size={16} />,
    onConnect: () => {},
    onDisconnect: () => {},
    onSync: () => {},
  },
};
