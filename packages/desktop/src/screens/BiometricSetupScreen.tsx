/**
 * BiometricSetupScreen — Biometric authentication enrollment and settings.
 * Shows biometric availability status, enable/disable toggle, test, and lock timeout config.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { prefGet, prefSet, sidecarCall } from '../ipc/commands';
import { Card, Button, StatusIndicator, SkeletonCard } from '@semblance/ui';
import './BiometricSetupScreen.css';

type LockTimeout = '1min' | '5min' | '15min' | '30min' | 'never';

const TIMEOUT_OPTIONS: { value: LockTimeout; label: string }[] = [
  { value: '1min', label: '1 min' },
  { value: '5min', label: '5 min' },
  { value: '15min', label: '15 min' },
  { value: '30min', label: '30 min' },
  { value: 'never', label: 'Never' },
];

/** Read a persisted biometric preference from SQLite via IPC. */
async function loadPref<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await prefGet(`biometric.${key}`);
    return raw !== null ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Persist a biometric preference to SQLite via IPC. */
function savePref(key: string, value: unknown): void {
  prefSet(`biometric.${key}`, JSON.stringify(value)).catch(() => {});
}

export function BiometricSetupScreen() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [lockTimeout, setLockTimeout] = useState<LockTimeout>('5min');
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'failed'>('idle');

  // On mount: detect biometric hardware and load persisted preferences
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        // Attempt Tauri sidecar command first
        const result = await sidecarCall<{ available: boolean }>('biometric:check', {});
        if (!cancelled) setBiometricAvailable(result.available);
      } catch {
        // Fallback: WebAuthn platform authenticator detection
        if (window.PublicKeyCredential) {
          try {
            const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
            if (!cancelled) setBiometricAvailable(available);
          } catch {
            if (!cancelled) setBiometricAvailable(false);
          }
        }
      }

      // Hydrate persisted preferences from SQLite
      const [enabled, timeout] = await Promise.all([
        loadPref<boolean>('enabled', false),
        loadPref<LockTimeout>('lockTimeout', '5min'),
      ]);
      if (!cancelled) {
        setBiometricEnabled(enabled);
        setLockTimeout(timeout);
        setLoading(false);
      }
    };

    init();
    return () => { cancelled = true; };
  }, []);

  // Persist biometricEnabled whenever it changes via toggle
  const handleToggleBiometric = useCallback(() => {
    setBiometricEnabled((prev) => {
      const next = !prev;
      savePref('enabled', next);
      return next;
    });
  }, []);

  // Persist lockTimeout whenever user selects a different value
  const handleSetTimeout = useCallback((value: LockTimeout) => {
    setLockTimeout(value);
    savePref('lockTimeout', value);
  }, []);

  // Test biometric authentication via Tauri command, falling back to WebAuthn
  const handleTest = useCallback(async () => {
    setTestResult('idle');
    try {
      // Attempt Tauri sidecar biometric challenge
      const result = await sidecarCall<{ success: boolean }>('biometric:test', {});
      setTestResult(result.success ? 'success' : 'failed');
    } catch {
      // Fallback: WebAuthn assertion with userVerification required
      try {
        const credential = await navigator.credentials.get({
          publicKey: {
            challenge: crypto.getRandomValues(new Uint8Array(32)),
            timeout: 30000,
            rpId: window.location.hostname || 'localhost',
            userVerification: 'required',
            allowCredentials: [],
          },
        });
        setTestResult(credential ? 'success' : 'failed');
      } catch {
        setTestResult('failed');
      }
    }
  }, []);

  if (loading) {
    return (
      <div className="biometric-setup page-scroll">
        <div className="biometric-setup__container page-layout">
          <h1 className="biometric-setup__title">{t('screen.biometric.title')}</h1>
          <p className="biometric-setup__subtitle">{t('screen.biometric.subtitle')}</p>
          <SkeletonCard
            variant="generic"
            message="Loading biometric settings"
            subMessage="Detecting security hardware"
            showSpinner
          />
        </div>
      </div>
    );
  }

  return (
    <div className="biometric-setup page-scroll">
      <div className="biometric-setup__container page-layout">
        <h1 className="biometric-setup__title">{t('screen.biometric.title')}</h1>
        <p className="biometric-setup__subtitle">
          {t('screen.biometric.subtitle')}
        </p>

        {/* Availability status */}
        <Card className="biometric-setup__card">
          <h2 className="biometric-setup__section-title">{t('screen.biometric.system_status')}</h2>
          <div className="biometric-setup__status-row">
            <span className="biometric-setup__status-label">{t('screen.biometric.hardware')}</span>
            <div className="biometric-setup__status-indicator-row">
              <StatusIndicator status={biometricAvailable ? 'success' : 'muted'} />
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
          </div>
          <div className="biometric-setup__status-row">
            <span className="biometric-setup__status-label">{t('screen.biometric.enrollment')}</span>
            <div className="biometric-setup__status-indicator-row">
              <StatusIndicator status={biometricEnabled ? 'success' : 'muted'} />
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
        </Card>

        {/* Enable/disable toggle */}
        <Card className="biometric-setup__card">
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
              onClick={handleToggleBiometric}
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
                <Button
                  key={opt.value}
                  variant={lockTimeout === opt.value ? 'opal' : 'ghost'}
                  size="sm"
                  onClick={() => handleSetTimeout(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
        </Card>

        {/* Test */}
        <Card className="biometric-setup__card">
          <h2 className="biometric-setup__section-title">{t('screen.biometric.verification_test')}</h2>
          <div className="biometric-setup__actions">
            <Button
              variant="opal"
              size="md"
              disabled={!biometricEnabled}
              onClick={handleTest}
            >
              {t('screen.biometric.test_biometric')}
            </Button>
            {testResult === 'success' && (
              <StatusIndicator status="success" className="biometric-setup__test-indicator" />
            )}
            {testResult === 'failed' && (
              <StatusIndicator status="attention" className="biometric-setup__test-indicator" />
            )}
            {testResult === 'success' && (
              <span className="biometric-setup__test-label biometric-setup__test-label--success">
                {t('screen.biometric.verification_passed')}
              </span>
            )}
            {testResult === 'failed' && (
              <span className="biometric-setup__test-label biometric-setup__test-label--failed">
                {t('screen.biometric.verification_failed')}
              </span>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
