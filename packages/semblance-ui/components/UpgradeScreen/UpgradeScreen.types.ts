export interface UpgradeScreenProps {
  /** Current license tier */
  currentTier: 'free' | 'founding' | 'digital-representative' | 'lifetime';
  /** Whether the user is a founding member */
  isFoundingMember: boolean;
  /** Founding member seat number */
  foundingSeat: number | null;
  /** Open checkout in system browser */
  onCheckout: (plan: 'monthly' | 'founding' | 'lifetime') => void;
  /** Activate a license key manually */
  onActivateKey: (key: string) => Promise<{ success: boolean; error?: string }>;
  /** Open subscription management portal */
  onManageSubscription?: () => void;
  /** Navigate back */
  onBack?: () => void;
}

export const FEATURES = [
  'Digital Representative email drafting',
  'Subscription detection & cancellation',
  'Form & bureaucracy automation',
  'Financial awareness & spending insights',
  'Health & wellness tracking',
  'Import Everything (browser, notes, photos)',
  'Dark pattern detection',
  'Living Will & Witness attestation',
  'Adversarial self-defense',
];
