import { useState } from 'react';
import { Button } from '../Button/Button';
import {
  CAPABILITY_PREVIEW_COPY,
  type CapabilityPreviewProps,
} from './CapabilityPreview.types';
import './CapabilityPreview.css';

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6ECFA3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export function CapabilityPreview({
  feature,
  newSalesEnabled,
  onFoundingCheckout,
  onRedeem,
  onDismiss,
}: CapabilityPreviewProps) {
  const [dismissed, setDismissed] = useState(false);
  const copy = CAPABILITY_PREVIEW_COPY[feature];

  if (dismissed) {
    return null;
  }

  function handleDismiss() {
    setDismissed(true);
    onDismiss?.();
  }

  return (
    <div className="capability-preview" data-testid="capability-preview" data-feature={feature}>
      <div className="capability-preview__header">
        <LockIcon />
        <span className="capability-preview__badge">Digital Representative</span>
      </div>

      <div className="capability-preview__divider" />

      <h2 className="capability-preview__headline">{copy.headline}</h2>
      <p className="capability-preview__preview">{copy.preview}</p>

      <ul className="capability-preview__bullets">
        {copy.bullets.map((bullet) => (
          <li key={bullet} className="capability-preview__bullet">
            <span className="capability-preview__bullet-mark" aria-hidden="true">•</span>
            <span>{bullet}</span>
          </li>
        ))}
      </ul>

      <div className="capability-preview__actions">
        {newSalesEnabled ? (
          <Button variant="opal" size="sm" onClick={onFoundingCheckout}>
            Join founding members
          </Button>
        ) : (
          <Button variant="opal" size="sm" onClick={onRedeem}>
            View plans
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onRedeem}>
          Redeem entitlement
        </Button>
        <Button variant="ghost" size="sm" onClick={handleDismiss}>
          Not right now
        </Button>
      </div>

      <p className="capability-preview__footnote">
        Preview only — activating Digital Representative requires a signed paid entitlement on this device.
      </p>
    </div>
  );
}
