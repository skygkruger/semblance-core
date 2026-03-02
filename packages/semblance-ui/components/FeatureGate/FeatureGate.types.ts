import type { ReactNode } from 'react';

export type PremiumFeature =
  | 'transaction-categorization'
  | 'spending-insights'
  | 'anomaly-detection'
  | 'plaid-integration'
  | 'financial-dashboard'
  | 'representative-drafting'
  | 'subscription-cancellation'
  | 'representative-dashboard'
  | 'form-automation'
  | 'bureaucracy-tracking'
  | 'health-tracking'
  | 'health-insights'
  | 'import-digital-life'
  | 'dark-pattern-detection'
  | 'financial-advocacy'
  | 'living-will'
  | 'witness-attestation'
  | 'inheritance-protocol'
  | 'semblance-network'
  | 'proof-of-privacy';

export interface FeatureGateProps {
  /** The premium feature being gated */
  feature: PremiumFeature;
  /** Whether the user has premium access */
  isPremium: boolean;
  /** Content shown when feature is available */
  children: ReactNode;
  /** Custom fallback when locked (defaults to upgrade prompt) */
  fallback?: ReactNode;
  /** Called when "Learn more" is clicked */
  onLearnMore?: () => void;
}
