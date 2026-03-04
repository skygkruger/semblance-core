import type { Meta, StoryObj } from '@storybook/react';
import { ConnectorCard } from './ConnectorCard';
import { DotMatrix } from '../DotMatrix/DotMatrix';
import { EnvelopeIcon, CalendarIcon, HeartIcon, DollarIcon } from '../ConnectionsScreen/ConnectorIcons';

const meta: Meta<typeof ConnectorCard> = {
  title: 'Components/ConnectorCard',
  component: ConnectorCard,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#0B0E11', overflow: 'hidden' }}>
        <DotMatrix />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40 }}>
          <div style={{ width: '100%', maxWidth: 480 }}>
            <Story />
          </div>
        </div>
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
