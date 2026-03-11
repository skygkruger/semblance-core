import type { Meta, StoryObj } from '@storybook/react';
import { SettingsAccount } from './SettingsAccount';
import { DotMatrix } from '../DotMatrix/DotMatrix';

const meta: Meta<typeof SettingsAccount> = {
  title: 'Settings/SettingsAccount',
  component: SettingsAccount,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ position: 'relative', width: '100vw', minHeight: '100vh', background: '#0B0E11', overflow: 'hidden' }}>
        <DotMatrix />
        <div style={{ position: 'relative', zIndex: 1, width: '100%', minHeight: '100vh' }}>
          <Story />
        </div>
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof SettingsAccount>;

const callbacks = {
  onRenewLicense: () => console.log('Renew'),
  onActivateDigitalRepresentative: () => console.log('Activate DR'),
  onViewDRAgreement: () => console.log('View DR agreement'),
  onRenameSemblance: (name: string) => console.log('Rename:', name),
  onSignOut: () => console.log('Sign out'),
  onDeactivateLicense: () => console.log('Deactivate'),
  onBack: () => console.log('Back'),
};

export const FoundingMember: Story = {
  args: {
    licenseStatus: 'founding-member',
    licenseActivationDate: 'Feb 1, 2026',
    digitalRepresentativeActive: true,
    digitalRepresentativeActivationDate: 'Feb 1, 2026',
    semblanceName: 'Atlas',
    ...callbacks,
  },
};

export const ActiveLicense: Story = {
  args: {
    licenseStatus: 'active',
    licenseActivationDate: 'Feb 15, 2026',
    digitalRepresentativeActive: true,
    digitalRepresentativeActivationDate: 'Feb 15, 2026',
    semblanceName: 'Nova',
    ...callbacks,
  },
};

export const Free: Story = {
  args: {
    licenseStatus: 'free',
    licenseActivationDate: 'Feb 20, 2026',
    trialDaysRemaining: 12,
    digitalRepresentativeActive: false,
    digitalRepresentativeActivationDate: null,
    semblanceName: 'Echo',
    ...callbacks,
  },
};

export const Expired: Story = {
  args: {
    licenseStatus: 'expired',
    licenseActivationDate: 'Jan 1, 2026',
    digitalRepresentativeActive: false,
    digitalRepresentativeActivationDate: null,
    semblanceName: 'Sage',
    ...callbacks,
  },
};

export const DigitalRepresentativeActive: Story = {
  args: {
    ...FoundingMember.args,
  },
};

export const Mobile: Story = {
  args: { ...FoundingMember.args },
  parameters: {
    viewport: { defaultViewport: 'mobile' },
  },
};
