import { Button } from '../Button/Button';
import { LicenseActivation } from '../LicenseActivation/LicenseActivation';
import './UpgradeScreen.css';

interface UpgradeScreenProps {
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

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

const FEATURES = [
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

export function UpgradeScreen({
  currentTier,
  isFoundingMember,
  foundingSeat,
  onCheckout,
  onActivateKey,
  onManageSubscription,
  onBack,
}: UpgradeScreenProps) {
  const isActive = currentTier !== 'free';

  return (
    <div className="upgrade-screen">
      {onBack && (
        <button type="button" className="upgrade-screen__back" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
          </svg>
          Back
        </button>
      )}

      <div className="upgrade-screen__header">
        <h1 className="upgrade-screen__title">
          {isActive ? 'Your Plan' : 'Upgrade Semblance'}
        </h1>
        <p className="upgrade-screen__subtitle">
          {isActive
            ? `You're on the ${currentTier === 'digital-representative' ? 'Digital Representative' : currentTier === 'founding' ? 'Founding Member' : 'Lifetime'} plan.`
            : 'The paid tier keeps Semblance independent and in your hands.'
          }
        </p>
      </div>

      {!isActive && (
        <div className="upgrade-screen__plans">
          {/* Monthly */}
          <div className="upgrade-screen__plan">
            <div className="upgrade-screen__plan-header">
              <span className="upgrade-screen__plan-label">MONTHLY</span>
              <div className="upgrade-screen__plan-price">
                <span className="upgrade-screen__price-amount">$18</span>
                <span className="upgrade-screen__price-period">/mo</span>
              </div>
            </div>
            <ul className="upgrade-screen__feature-list">
              {FEATURES.map((f) => (
                <li key={f} className="upgrade-screen__feature-item">
                  <CheckIcon />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Button variant="ghost" size="md" onClick={() => onCheckout('monthly')} className="upgrade-screen__cta">
              Start Monthly
            </Button>
          </div>

          {/* Founding */}
          <div className="upgrade-screen__plan upgrade-screen__plan--recommended">
            <div className="upgrade-screen__plan-badge">RECOMMENDED</div>
            <div className="upgrade-screen__plan-header">
              <span className="upgrade-screen__plan-label">FOUNDING THOUSAND</span>
              <div className="upgrade-screen__plan-price">
                <span className="upgrade-screen__price-amount">$199</span>
                <span className="upgrade-screen__price-period">lifetime</span>
              </div>
            </div>
            <p className="upgrade-screen__plan-note">
              Limited to 500 seats. Permanent recognition. Everything included, forever.
            </p>
            <ul className="upgrade-screen__feature-list">
              {FEATURES.map((f) => (
                <li key={f} className="upgrade-screen__feature-item">
                  <CheckIcon />
                  <span>{f}</span>
                </li>
              ))}
              <li className="upgrade-screen__feature-item upgrade-screen__feature-item--bonus">
                <CheckIcon />
                <span>Founding Member badge & seat number</span>
              </li>
            </ul>
            <Button variant="solid" size="md" onClick={() => onCheckout('founding')} className="upgrade-screen__cta">
              Become a Founder
            </Button>
          </div>

          {/* Lifetime */}
          <div className="upgrade-screen__plan">
            <div className="upgrade-screen__plan-header">
              <span className="upgrade-screen__plan-label">LIFETIME</span>
              <div className="upgrade-screen__plan-price">
                <span className="upgrade-screen__price-amount">$349</span>
                <span className="upgrade-screen__price-period">one-time</span>
              </div>
            </div>
            <ul className="upgrade-screen__feature-list">
              {FEATURES.map((f) => (
                <li key={f} className="upgrade-screen__feature-item">
                  <CheckIcon />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Button variant="ghost" size="md" onClick={() => onCheckout('lifetime')} className="upgrade-screen__cta">
              Get Lifetime Access
            </Button>
          </div>
        </div>
      )}

      {isActive && isFoundingMember && foundingSeat !== null && (
        <div className="upgrade-screen__active-info">
          <p className="upgrade-screen__active-tier">Founding Member #{foundingSeat}</p>
          <p className="upgrade-screen__active-note">Lifetime access. All features included.</p>
        </div>
      )}

      {isActive && currentTier === 'digital-representative' && onManageSubscription && (
        <div className="upgrade-screen__active-info">
          <p className="upgrade-screen__active-tier">Digital Representative</p>
          <p className="upgrade-screen__active-note">Monthly subscription. All premium features active.</p>
          <Button variant="ghost" size="sm" onClick={onManageSubscription} className="upgrade-screen__manage-btn">
            Manage Subscription
          </Button>
        </div>
      )}

      {isActive && currentTier === 'lifetime' && !isFoundingMember && (
        <div className="upgrade-screen__active-info">
          <p className="upgrade-screen__active-tier">Lifetime</p>
          <p className="upgrade-screen__active-note">Lifetime access. All features included.</p>
        </div>
      )}

      <div className="upgrade-screen__activation">
        <div className="upgrade-screen__activation-divider" />
        <p className="upgrade-screen__activation-label">Already have a license key?</p>
        <LicenseActivation onActivate={onActivateKey} />
      </div>
    </div>
  );
}
