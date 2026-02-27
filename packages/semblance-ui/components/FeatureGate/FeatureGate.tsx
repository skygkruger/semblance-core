import { useState, type ReactNode } from 'react';
import { Button } from '../Button/Button';
import './FeatureGate.css';

type PremiumFeature =
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

interface FeatureGateProps {
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

function LockIcon() {
  return (
    <svg className="feature-gate__lock-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function DefaultFallback({ onLearnMore }: { onLearnMore?: () => void }) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="feature-gate__locked">
      <div className="feature-gate__locked-header">
        <LockIcon />
        <span className="feature-gate__locked-label">DIGITAL REPRESENTATIVE</span>
      </div>

      <div className="feature-gate__locked-divider" />

      <p className="feature-gate__locked-body">
        This is a Digital Representative feature. It&apos;s part of the paid tier that keeps
        Semblance independent and in your hands.
      </p>
      <p className="feature-gate__locked-body">
        If Semblance has been useful, this is how you support that — and get more from it.
      </p>

      <div className="feature-gate__locked-actions">
        <Button variant="solid" size="sm" onClick={onLearnMore}>
          Learn more
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setDismissed(true)}>
          Not right now
        </Button>
      </div>
    </div>
  );
}

export function FeatureGate({
  isPremium,
  children,
  fallback,
  onLearnMore,
}: FeatureGateProps) {
  if (isPremium) {
    return <>{children}</>;
  }

  return <>{fallback ?? <DefaultFallback onLearnMore={onLearnMore} />}</>;
}
