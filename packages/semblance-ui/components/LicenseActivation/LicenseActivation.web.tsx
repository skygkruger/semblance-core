import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../Button/Button';
import { Input } from '../Input/Input';
import type { LicenseActivationProps } from './LicenseActivation.types';
import './LicenseActivation.css';

export function LicenseActivation({ onActivate, alreadyActive, className = '' }: LicenseActivationProps) {
  const { t } = useTranslation();
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<'idle' | 'validating' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed) return;

    setStatus('validating');
    setErrorMessage('');

    const result = await onActivate(trimmed);

    if (result.success) {
      setStatus('success');
      setKey('');
    } else {
      setStatus('error');
      setErrorMessage(result.error ?? t('license.activation_failed'));
    }
  };

  if (alreadyActive) {
    return (
      <div className={`license-activation license-activation--active ${className}`.trim()}>
        <div className="license-activation__status license-activation__status--success">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{t('license.active')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`license-activation ${className}`.trim()}>
      <form className="license-activation__form" onSubmit={handleSubmit}>
        <Input
          value={key}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setKey(e.target.value);
            if (status === 'error') setStatus('idle');
          }}
          placeholder="sem_..."
          disabled={status === 'validating'}
          className="license-activation__input"
          aria-label={t('a11y.license_key')}
        />
        <Button
          variant="solid"
          size="sm"
          type="submit"
          disabled={!key.trim() || status === 'validating'}
        >
          {status === 'validating' ? t('license.activating') : t('license.activate')}
        </Button>
      </form>

      {status === 'success' && (
        <div className="license-activation__status license-activation__status--success">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{t('license.activated_success')}</span>
        </div>
      )}

      {status === 'error' && (
        <div className="license-activation__status license-activation__status--error">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}
