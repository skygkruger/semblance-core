// UpgradeEmailCapture — Collects email for Stripe checkout flow.
//
// "No account required -- ever. We just need an address to send your license key."
// Email is held in memory only for the duration of the Stripe flow.
// Not persisted anywhere in the app.

import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../Button/Button';
import { Input } from '../Input/Input';
import type { UpgradeEmailCaptureProps } from './UpgradeEmailCapture.types';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function UpgradeEmailCapture({ onSubmit, loading = false, className = '' }: UpgradeEmailCaptureProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const isValid = EMAIL_REGEX.test(email.trim());
  const showError = touched && email.trim().length > 0 && !isValid;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!isValid) return;
    onSubmit(email.trim());
  };

  return (
    <div className={`space-y-4 ${className}`.trim()}>
      <p
        style={{
          color: '#8593A4',
          fontSize: '14px',
          lineHeight: '1.5',
          fontFamily: "'DM Sans', system-ui, sans-serif",
          margin: 0,
        }}
      >
        {t('upgrade.email_notice', {
          defaultValue: "No account required \u2014 ever. We just need an address to send your license key.",
        })}
      </p>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <Input
            type="email"
            value={email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setEmail(e.target.value);
              if (!touched) setTouched(true);
            }}
            placeholder="you@example.com"
            disabled={loading}
            aria-label={t('a11y.email_address', { defaultValue: 'Email address' })}
            aria-invalid={showError}
          />
          {showError && (
            <p style={{ color: '#C97B6E', fontSize: '12px', marginTop: '4px' }}>
              {t('validation.email_invalid', { defaultValue: 'Please enter a valid email address' })}
            </p>
          )}
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
    </div>
  );
}
