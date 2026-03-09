/**
 * BiometricSetupScreen — Biometric authentication enrollment and settings.
 * Shows biometric availability status, enable/disable toggle, test, and lock timeout config.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import './BiometricSetupScreen.css';

type LockTimeout = '1min' | '5min' | '15min' | '30min' | 'never';

const TIMEOUT_OPTIONS: { value: LockTimeout; label: string }[] = [
  { value: '1min', label: '1 min' },
  { value: '5min', label: '5 min' },
  { value: '15min', label: '15 min' },
  { value: '30min', label: '30 min' },
  { value: 'never', label: 'Never' },
];

export function BiometricSetupScreen() {
  const { t } = useTranslation();
  const [biometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [lockTimeout, setLockTimeout] = useState<LockTimeout>('5min');
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'failed'>('idle');

  function handleTest() {
    // TODO: Sprint 6 — wire to Tauri biometric test command
    setTestResult('idle');
  }

  return (
    <div className="biometric-setup h-full overflow-y-auto">
      <div className="biometric-setup__container">
        <h1 className="biometric-setup__title">{t('screen.biometric.title')}</h1>
        <p className="biometric-setup__subtitle">
          {t('screen.biometric.subtitle')}
        </p>

        {/* Availability status */}
        <div className="biometric-setup__card surface-void opal-wireframe">
          <h2 className="biometric-setup__section-title">{t('screen.biometric.system_status')}</h2>
          <div className="biometric-setup__status-row">
            <span className="biometric-setup__status-label">{t('screen.biometric.hardware')}</span>
            <span
              className={`biometric-setup__status-value ${
                biometricAvailable
                  ? 'biometric-setup__status-value--available'
                  : 'biometric-setup__status-value--unavailable'
              }`}
            >
              {biometricAvailable ? t('screen.biometric.available') : t('screen.biometric.not_detected')}
            </span>
          </div>
          <div className="biometric-setup__status-row">
            <span className="biometric-setup__status-label">{t('screen.biometric.enrollment')}</span>
            <span
              className={`biometric-setup__status-value ${
                biometricEnabled
                  ? 'biometric-setup__status-value--available'
                  : 'biometric-setup__status-value--unavailable'
              }`}
            >
              {biometricEnabled ? t('screen.biometric.enrolled') : t('screen.biometric.not_enrolled')}
            </span>
          </div>
        </div>

        {/* Enable/disable toggle */}
        <div className="biometric-setup__card surface-void opal-wireframe">
          <h2 className="biometric-setup__section-title">{t('screen.biometric.settings')}</h2>
          <div className="biometric-setup__toggle-row">
            <div className="biometric-setup__toggle-info">
              <span className="biometric-setup__toggle-label">{t('screen.biometric.enable_unlock')}</span>
              <span className="biometric-setup__toggle-hint">
                {biometricAvailable
                  ? t('screen.biometric.use_biometric')
                  : t('screen.biometric.no_hardware')}
              </span>
            </div>
            <button
              type="button"
              className={`biometric-setup__toggle ${biometricEnabled ? 'biometric-setup__toggle--active' : ''}`}
              onClick={() => setBiometricEnabled(!biometricEnabled)}
              disabled={!biometricAvailable}
              aria-pressed={biometricEnabled}
              aria-label="Toggle biometric unlock"
            >
              <span className="biometric-setup__toggle-knob" />
            </button>
          </div>

          {/* Lock timeout */}
          <div className="biometric-setup__toggle-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
            <span className="biometric-setup__toggle-label">{t('screen.biometric.lock_timeout')}</span>
            <div className="biometric-setup__timeout-selector">
              {TIMEOUT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`biometric-setup__timeout-option ${
                    lockTimeout === opt.value ? 'biometric-setup__timeout-option--selected' : ''
                  }`}
                  onClick={() => setLockTimeout(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Test */}
        <div className="biometric-setup__card surface-void opal-wireframe">
          <h2 className="biometric-setup__section-title">{t('screen.biometric.verification_test')}</h2>
          <div className="biometric-setup__actions">
            <button
              type="button"
              className="biometric-setup__btn biometric-setup__btn--primary"
              disabled={!biometricEnabled}
              onClick={handleTest}
            >
              {t('screen.biometric.test_biometric')}
            </button>
            {testResult === 'success' && (
              <span style={{ fontFamily: 'var(--fm)', fontSize: 'var(--text-xs)', color: '#6ECFA3', alignSelf: 'center' }}>
                {t('screen.biometric.verification_passed')}
              </span>
            )}
            {testResult === 'failed' && (
              <span style={{ fontFamily: 'var(--fm)', fontSize: 'var(--text-xs)', color: '#B07A8A', alignSelf: 'center' }}>
                {t('screen.biometric.verification_failed')}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
