import type { Meta, StoryObj } from '@storybook/react';
import { SettingsAutonomy } from './SettingsAutonomy';

const meta: Meta<typeof SettingsAutonomy> = {
  title: 'Settings/SettingsAutonomy',
  component: SettingsAutonomy,
  parameters: {
    backgrounds: { default: 'void', values: [{ name: 'void', value: '#0B0E11' }] },
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof SettingsAutonomy>;

const baseArgs = {
  domainOverrides: {} as Record<string, 'guardian' | 'partner' | 'alter-ego' | 'default'>,
  requireConfirmationForIrreversible: true,
  actionReviewWindow: '1m' as const,
  onChange: (key: string, value: unknown) => console.log('Change:', key, value),
  onBack: () => console.log('Back'),
};

export const GuardianActive: Story = {
  args: {
    ...baseArgs,
    currentTier: 'guardian',
  },
};

export const PartnerActive: Story = {
  args: {
    ...baseArgs,
    currentTier: 'partner',
  },
};

export const AlterEgoActive: Story = {
  args: {
    ...baseArgs,
    currentTier: 'alter-ego',
  },
};

export const WithDomainOverrides: Story = {
  args: {
    ...baseArgs,
    currentTier: 'alter-ego',
    domainOverrides: {
      email: 'alter-ego',
      calendar: 'alter-ego',
      files: 'partner',
      finance: 'guardian',
      health: 'default',
      services: 'alter-ego',
    },
  },
};

export const Mobile: Story = {
  args: { ...PartnerActive.args },
  parameters: {
    viewport: { defaultViewport: 'mobile' },
  },
};
