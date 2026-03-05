export interface SettingsAccountProps {
  licenseStatus: 'founding-member' | 'active' | 'trial' | 'expired';
  licenseActivationDate: string;
  trialDaysRemaining?: number;
  digitalRepresentativeActive: boolean;
  digitalRepresentativeActivationDate: string | null;
  semblanceName: string;
  onRenewLicense: () => void;
  onActivateDigitalRepresentative: () => void;
  onViewDRAgreement: () => void;
  onRenameSemblance: (name: string) => void;
  onSignOut: () => void;
  onDeactivateLicense: () => void;
  onBack: () => void;
}

export interface LicenseConfig {
  label: string;
  badge: string;
  badgeVariant: 'opal' | 'veridian' | 'muted' | 'critical';
  cardVariant: 'opal' | 'active' | 'default' | 'critical';
  desc: string;
}

export const licenseConfigs: Record<string, LicenseConfig> = {
  'founding-member': {
    label: 'Founding Member',
    badge: 'FOUNDING MEMBER',
    badgeVariant: 'opal',
    cardVariant: 'opal',
    desc: 'Lifetime access \u00B7 all features',
  },
  active: {
    label: 'Digital Representative',
    badge: 'ACTIVE',
    badgeVariant: 'veridian',
    cardVariant: 'active',
    desc: 'All premium features active',
  },
  trial: {
    label: 'Trial',
    badge: 'TRIAL',
    badgeVariant: 'muted',
    cardVariant: 'default',
    desc: 'Exploring premium features',
  },
  expired: {
    label: 'Expired',
    badge: 'EXPIRED',
    badgeVariant: 'critical',
    cardVariant: 'critical',
    desc: 'License expired \u2014 core features still available',
  },
};
