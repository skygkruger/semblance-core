import type { Meta, StoryObj } from '@storybook/react';
import { CredentialForm } from './CredentialForm';
import { DotMatrix } from '../DotMatrix/DotMatrix';
import type { ProviderPreset } from './CredentialForm.types';

const emailPresets: Record<string, ProviderPreset> = {
  gmail: { name: 'Gmail', imapHost: 'imap.gmail.com', imapPort: 993, smtpHost: 'smtp.gmail.com', smtpPort: 587, caldavUrl: null, notes: 'Gmail requires an app-specific password. Enable 2-Step Verification, then generate one at myaccount.google.com.' },
  outlook: { name: 'Outlook', imapHost: 'outlook.office365.com', imapPort: 993, smtpHost: 'smtp.office365.com', smtpPort: 587, caldavUrl: null, notes: null },
  fastmail: { name: 'Fastmail', imapHost: 'imap.fastmail.com', imapPort: 993, smtpHost: 'smtp.fastmail.com', smtpPort: 587, caldavUrl: null, notes: null },
  protonmail: { name: 'Proton Mail', imapHost: 'imap.protonmail.ch', imapPort: 993, smtpHost: 'smtp.protonmail.ch', smtpPort: 587, caldavUrl: null, notes: 'ProtonMail requires the Proton Bridge app running locally for IMAP access.' },
};

const calendarPresets: Record<string, ProviderPreset> = {
  google: { name: 'Google Calendar', imapHost: '', imapPort: 0, smtpHost: '', smtpPort: 0, caldavUrl: 'https://apidata.googleusercontent.com/caldav/v2', notes: 'Google Calendar requires an app-specific password if 2-Step Verification is enabled.' },
  icloud: { name: 'iCloud', imapHost: '', imapPort: 0, smtpHost: '', smtpPort: 0, caldavUrl: 'https://caldav.icloud.com', notes: null },
  fastmail: { name: 'Fastmail', imapHost: '', imapPort: 0, smtpHost: '', smtpPort: 0, caldavUrl: 'https://caldav.fastmail.com/dav/calendars', notes: null },
};

const meta: Meta<typeof CredentialForm> = {
  title: 'Components/CredentialForm',
  component: CredentialForm,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#0B0E11', overflow: 'hidden' }}>
        <DotMatrix />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40 }}>
          <div style={{ width: '100%', maxWidth: 520 }}>
            <Story />
          </div>
        </div>
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
