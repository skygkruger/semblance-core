export type Tier = 'guardian' | 'partner' | 'alter-ego';

export interface SettingsAutonomyProps {
  currentTier: Tier;
  domainOverrides: Record<string, 'guardian' | 'partner' | 'alter-ego' | 'default'>;
  requireConfirmationForIrreversible: boolean;
  actionReviewWindow: '30s' | '1m' | '5m';
  onChange: (key: string, value: unknown) => void;
  onBack: () => void;
}

export const tiers: Array<{ id: Tier; name: string; desc: string }> = [
  { id: 'guardian', name: 'Guardian', desc: 'Approve everything before it happens' },
  { id: 'partner', name: 'Partner', desc: 'Handle routine tasks, ask about important ones' },
  { id: 'alter-ego', name: 'Alter Ego', desc: 'Act as me for nearly everything' },
];

export const tierLabels: Record<string, string> = {
  guardian: 'Guardian',
  partner: 'Partner',
  'alter-ego': 'Alter Ego',
  default: 'Default',
};

export const domains = ['Email', 'Calendar', 'Files', 'Finance', 'Health', 'Services'];

export const reviewLabels: Record<string, string> = { '30s': '30 seconds', '1m': '1 minute', '5m': '5 minutes' };
