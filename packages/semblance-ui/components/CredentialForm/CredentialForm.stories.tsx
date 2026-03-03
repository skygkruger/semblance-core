import type { Meta, StoryObj } from '@storybook/react';
import { CredentialForm } from './CredentialForm';

const emailPresets: Record<string, { name: string; imapHost: string; imapPort: number; smtpHost: string; smtpPort: number; notes?: string }> = {
  gmail: { name: 'Gmail', imapHost: 'imap.gmail.com', imapPort: 993, smtpHost: 'smtp.gmail.com', smtpPort: 587, notes: 'Gmail requires an app-specific password. Enable 2-Step Verification, then generate one at myaccount.google.com.' },
  outlook: { name: 'Outlook', imapHost: 'outlook.office365.com', imapPort: 993, smtpHost: 'smtp.office365.com', smtpPort: 587 },
  fastmail: { name: 'Fastmail', imapHost: 'imap.fastmail.com', imapPort: 993, smtpHost: 'smtp.fastmail.com', smtpPort: 587 },
  proton: { name: 'ProtonMail', imapHost: 'imap.protonmail.ch', imapPort: 993, smtpHost: 'smtp.protonmail.ch', smtpPort: 587, notes: 'ProtonMail requires the Proton Bridge app running locally for IMAP access.' },
};

const calendarPresets: Record<string, { name: string; imapHost: string; imapPort: number; smtpHost: string; smtpPort: number; caldavUrl?: string }> = {
  google: { name: 'Google Calendar', imapHost: '', imapPort: 0, smtpHost: '', smtpPort: 0, caldavUrl: 'https://apidata.googleusercontent.com/caldav/v2' },
  icloud: { name: 'iCloud', imapHost: '', imapPort: 0, smtpHost: '', smtpPort: 0, caldavUrl: 'https://caldav.icloud.com' },
};

const meta: Meta<typeof CredentialForm> = {
  title: 'Components/CredentialForm',
  component: CredentialForm,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'void', values: [{ name: 'void', value: '#0B0E11' }] },
  },
  decorators: [
    (Story) => (
      <div style={{ background: '#0B0E11', padding: 40, width: '100%', maxWidth: 520 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof CredentialForm>;

export const EmailSetup: Story = {
  args: {
    serviceType: 'email',
    presets: emailPresets,
    onSave: async () => {},
    onTest: async () => ({ success: true }),
    onCancel: () => {},
  },
};

export const CalendarSetup: Story = {
  args: {
    serviceType: 'calendar',
    presets: calendarPresets,
    onSave: async () => {},
    onTest: async () => ({ success: true }),
    onCancel: () => {},
  },
};

export const NoPresets: Story = {
  args: {
    serviceType: 'email',
    onSave: async () => {},
    onTest: async () => ({ success: false, error: 'Connection refused' }),
    onCancel: () => {},
  },
};
