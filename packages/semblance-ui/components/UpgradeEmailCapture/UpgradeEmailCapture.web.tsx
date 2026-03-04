// UpgradeEmailCapture — Collects email for Stripe checkout flow.
//
// "No account required -- ever. We just need an address to send your license key."
// Email is held in memory only for the duration of the Stripe flow.
// Not persisted anywhere in the app.

import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../Card';
import { Button } from '../Button/Button';
import { Input } from '../Input/Input';
import type { UpgradeEmailCaptureProps } from './UpgradeEmailCapture.types';
import './UpgradeEmailCapture.css';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function UpgradeEmailCapture({ onSubmit, loading = false, className = '' }: UpgradeEmailCaptureProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [blurred, setBlurred] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const isValid = EMAIL_REGEX.test(email.trim());
  const showError = (blurred || submitted) && email.trim().length > 0 && !isValid;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!isValid) return;
    onSubmit(email.trim());
  };

  return (
    <Card className={className}>
      <p className="upgrade-capture__notice">
        {t('upgrade.email_notice', {
          defaultValue: "No account required \u2014 ever. We just need an address to send your license key.",
        })}
      </p>
      <form onSubmit={handleSubmit} className="upgrade-capture__form">
        <div className="upgrade-capture__input-wrap">
          <Input
            type="email"
            value={email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setEmail(e.target.value);
              if (blurred) setBlurred(false);
              if (submitted) setSubmitted(false);
            }}
            onBlur={() => {
              if (email.trim().length > 0) setBlurred(true);
            }}
            placeholder="you@example.com"
            disabled={loading}
            aria-label={t('a11y.email_address', { defaultValue: 'Email address' })}
            aria-invalid={showError}
          />
        </div>
        <Button
          variant="solid"
          size="md"
          type="submit"
          disabled={loading || !email.trim()}
        >
          {loading
            ? t('button.loading', { defaultValue: 'Loading...' })
            : t('button.continue', { defaultValue: 'Continue' })}
        </Button>
      </form>
      {showError && (
        <p className="upgrade-capture__error">
          {t('validation.email_invalid', { defaultValue: 'Please enter a valid email address' })}
        </p>
      )}
    </Card>
  );
}
