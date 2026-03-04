// TermsAcceptanceStep — Final onboarding step, after Initialize.
//
// User sees the product work first, understands what they're agreeing to.
// No legal friction before the emotional arc.
// First run only, never shown again.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button/Button';
import type { TermsAcceptanceStepProps } from './TermsAcceptanceStep.types';
import './Onboarding.css';

export function TermsAcceptanceStep({ onAccept, termsVersion = '1.0' }: TermsAcceptanceStepProps) {
  const { t } = useTranslation();
  const [checked, setChecked] = useState(false);

  return (
    <div
      style={{
        maxWidth: 560,
        width: '100%',
        padding: '0 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
      }}
    >
      <h2 className="onboarding-shimmer-headline" style={{ fontSize: 'var(--text-2xl)' }}>
        {t('onboarding.terms.title', { defaultValue: 'One last thing' })}
      </h2>

      <p
        style={{
          fontSize: '15px',
          lineHeight: '1.6',
          color: '#8593A4',
          fontFamily: "'DM Sans', system-ui, sans-serif",
          margin: 0,
        }}
      >
        {t('onboarding.terms.description', {
          defaultValue: "Semblance stores everything on your device. We don't collect your data, track your usage, or send anything to a server. Here's what you're agreeing to:",
        })}
      </p>

      <div
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: '8px',
          padding: '20px',
          maxHeight: '280px',
          overflowY: 'auto',
          fontSize: '13px',
          lineHeight: '1.7',
          color: '#8593A4',
          fontFamily: "'DM Mono', monospace",
        }}
      >
        <p style={{ margin: '0 0 12px' }}>
          <strong style={{ color: '#EEF1F4' }}>
            {t('onboarding.terms.local_heading', { defaultValue: 'Local-Only Processing' })}
          </strong>
          <br />
          {t('onboarding.terms.local_body', {
            defaultValue: 'All inference runs on your device. Your data never leaves your machine. We cannot access, read, or recover your data.',
          })}
        </p>
        <p style={{ margin: '0 0 12px' }}>
          <strong style={{ color: '#EEF1F4' }}>
            {t('onboarding.terms.no_telemetry_heading', { defaultValue: 'Zero Telemetry' })}
          </strong>
          <br />
          {t('onboarding.terms.no_telemetry_body', {
            defaultValue: 'No analytics, no crash reporting, no usage tracking. The app contains no code that phones home.',
          })}
        </p>
        <p style={{ margin: '0 0 12px' }}>
          <strong style={{ color: '#EEF1F4' }}>
            {t('onboarding.terms.license_heading', { defaultValue: 'License Terms' })}
          </strong>
          <br />
          {t('onboarding.terms.license_body', {
            defaultValue: 'Semblance is licensed for personal use. The free tier includes all core features. Premium features require a license key delivered via email.',
          })}
        </p>
        <p style={{ margin: 0 }}>
          <strong style={{ color: '#EEF1F4' }}>
            {t('onboarding.terms.your_data_heading', { defaultValue: 'Your Data, Your Rules' })}
          </strong>
          <br />
          {t('onboarding.terms.your_data_body', {
            defaultValue: 'You can export or delete all your data at any time. Disconnecting a service removes all associated data from the knowledge graph.',
          })}
        </p>
      </div>

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          cursor: 'pointer',
          fontSize: '14px',
          color: '#EEF1F4',
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          style={{
            width: '18px',
            height: '18px',
            accentColor: '#6ECFA3',
            cursor: 'pointer',
          }}
        />
        {t('onboarding.terms.checkbox', {
          defaultValue: 'I understand and accept these terms',
        })}
      </label>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="solid"
          size="md"
          disabled={!checked}
          onClick={onAccept}
        >
          {t('onboarding.terms.accept_button', { defaultValue: 'Get started' })}
        </Button>
      </div>

      <p
        style={{
          fontSize: '11px',
          color: '#4A5568',
          fontFamily: "'DM Mono', monospace",
          margin: 0,
          textAlign: 'center',
        }}
      >
        {t('onboarding.terms.version_label', { defaultValue: 'Terms version' })} {termsVersion}
      </p>
    </div>
  );
}
