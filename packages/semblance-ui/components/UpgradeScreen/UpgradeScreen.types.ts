export interface UpgradeScreenProps {
  /** Current license tier */
  currentTier: 'free' | 'founding' | 'digital-representative' | 'lifetime';
  /** Whether the user is a founding member */
  isFoundingMember: boolean;
  /** Founding member seat number */
  foundingSeat: number | null;
  /** Signed release-manifest switch for new checkout creation */
  newSalesEnabled: boolean;
  /** Open checkout in system browser */
  onCheckout: (plan: 'monthly' | 'founding' | 'lifetime') => void;
  /** Activate a license key manually */
  onActivateKey: (key: string) => Promise<{ success: boolean; error?: string }>;
  /** Import a legacy founding reservation without granting entitlement */
  onImportReservation?: (token: string) => Promise<{
    valid: boolean;
    kind: 'reservation_only';
    seat: number | null;
    error?: string;
  }>;
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
