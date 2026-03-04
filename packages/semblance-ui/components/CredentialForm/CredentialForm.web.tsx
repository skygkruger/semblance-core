/**
 * CredentialForm — Account setup form for email and calendar credentials.
 *
 * Supports provider presets (Gmail, Outlook, etc.) that pre-fill connection details.
 * Password field is masked with show/hide toggle.
 * Connection test must succeed before save is enabled.
 * All credential data stays local — privacy badge reinforces this.
 */

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { CredentialFormProps, CredentialFormData } from './CredentialForm.types';
import './CredentialForm.css';

export function CredentialForm({ serviceType, presets, onSave, onTest, onCancel }: CredentialFormProps) {
  const { t } = useTranslation();
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [imapHost, setImapHost] = useState('');
  const [imapPort, setImapPort] = useState(993);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [caldavHost, setCaldavHost] = useState('');
  const [caldavPort, setCaldavPort] = useState(443);
  const [useTLS, setUseTLS] = useState(true);
  const [showManual, setShowManual] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const providerKeys = presets ? Object.keys(presets) : [];

  const selectProvider = useCallback((key: string) => {
    setSelectedProvider(key);
    setShowManual(false);
    const preset = presets?.[key];
    if (preset) {
      setImapHost(preset.imapHost);
      setImapPort(preset.imapPort);
      setSmtpHost(preset.smtpHost);
      setSmtpPort(preset.smtpPort);
      if (preset.caldavUrl) {
        try {
          const url = new URL(preset.caldavUrl);
          setCaldavHost(url.hostname);
          setCaldavPort(url.port ? parseInt(url.port) : 443);
        } catch {
          setCaldavHost('');
        }
      }
      setDisplayName(preset.name);
    }
    setTestResult(null);
  }, [presets]);

  const isFormValid = username.trim() && password.trim() && displayName.trim();

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);

    const credential: CredentialFormData = serviceType === 'email'
      ? { serviceType: 'email', protocol: 'imap', host: imapHost, port: imapPort, username, password, useTLS, displayName }
      : { serviceType: 'calendar', protocol: 'caldav', host: caldavHost, port: caldavPort, username, password, useTLS, displayName };

    try {
      const result = await onTest(credential);
      setTestResult(result);
    } catch (err) {
      setTestResult({ success: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setTesting(false);
    }
  }, [serviceType, imapHost, imapPort, caldavHost, caldavPort, username, password, useTLS, displayName, onTest]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const creds: CredentialFormData[] = [];

      if (serviceType === 'email') {
        creds.push(
          { serviceType: 'email', protocol: 'imap', host: imapHost, port: imapPort, username, password, useTLS, displayName },
          { serviceType: 'email', protocol: 'smtp', host: smtpHost, port: smtpPort, username, password, useTLS, displayName },
        );
      } else {
        creds.push(
          { serviceType: 'calendar', protocol: 'caldav', host: caldavHost, port: caldavPort, username, password, useTLS, displayName },
        );
      }

      await onSave(creds);
    } finally {
      setSaving(false);
    }
  }, [serviceType, imapHost, imapPort, smtpHost, smtpPort, caldavHost, caldavPort, username, password, useTLS, displayName, onSave]);

  const providerNote = selectedProvider && presets?.[selectedProvider]?.notes;
  const showFields = selectedProvider || showManual;

  const title = serviceType === 'email'
    ? t('screen.credentials.title_email')
    : t('screen.credentials.title_calendar');

  return (
    <div className="credential-form">
      <h2 className="credential-form__title">{title}</h2>

      {/* Provider Selection */}
      <div>
        <p className="credential-form__section-label">
          {t('screen.credentials.choose_provider')}
        </p>
        <div className="credential-form__providers">
          {providerKeys.map(key => (
            <button
              key={key}
              type="button"
              onClick={() => selectProvider(key)}
              className={`credential-form__chip${selectedProvider === key ? ' credential-form__chip--active' : ''}`}
            >
              {presets?.[key]?.name ?? key}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { setSelectedProvider(null); setShowManual(true); setTestResult(null); }}
            className={`credential-form__chip${showManual && !selectedProvider ? ' credential-form__chip--active' : ''}`}
          >
            {t('screen.credentials.other')}
          </button>
        </div>
      </div>

      {/* Provider Note */}
      {providerNote && (
        <div className="credential-form__note">{providerNote}</div>
      )}

      {/* Credential Fields */}
      {showFields && (
        <div className="credential-form__fields">
          {/* Display Name */}
          <div className="credential-form__field">
            <label className="credential-form__field-label">{t('screen.credentials.label_display_name')}</label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder={t('placeholder.display_name')}
              className="credential-form__input"
            />
          </div>

          {/* Email / Username */}
          <div className="credential-form__field">
            <label className="credential-form__field-label">{t('screen.credentials.label_email')}</label>
            <input
              type="email"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder={t('placeholder.email_address')}
              className="credential-form__input"
              autoComplete="email"
            />
          </div>

          {/* Password */}
          <div className="credential-form__field">
            <label className="credential-form__field-label">{t('screen.credentials.label_password')}</label>
            <div className="credential-form__password-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={t('placeholder.password')}
                className="credential-form__input"
                style={{ paddingRight: 48 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="credential-form__password-toggle"
                aria-label={showPassword ? t('screen.credentials.hide_password') : t('screen.credentials.show_password')}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  {showPassword ? (
                    <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></>
                  ) : (
                    <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>
                  )}
                </svg>
              </button>
            </div>
          </div>

          {/* Manual Server Configuration — Email */}
          {showManual && !selectedProvider && serviceType === 'email' && (
            <>
              <div className="credential-form__server-grid">
                <div className="credential-form__field">
                  <label className="credential-form__field-label">{t('screen.credentials.label_imap')}</label>
                  <input type="text" value={imapHost} onChange={e => setImapHost(e.target.value)} placeholder="imap.example.com" className="credential-form__input" />
                </div>
                <div className="credential-form__field">
                  <label className="credential-form__field-label">{t('screen.credentials.label_port')}</label>
                  <input type="number" value={imapPort} onChange={e => setImapPort(parseInt(e.target.value) || 993)} className="credential-form__input" />
                </div>
              </div>
              <div className="credential-form__server-grid">
                <div className="credential-form__field">
                  <label className="credential-form__field-label">{t('screen.credentials.label_smtp')}</label>
                  <input type="text" value={smtpHost} onChange={e => setSmtpHost(e.target.value)} placeholder="smtp.example.com" className="credential-form__input" />
                </div>
                <div className="credential-form__field">
                  <label className="credential-form__field-label">{t('screen.credentials.label_port')}</label>
                  <input type="number" value={smtpPort} onChange={e => setSmtpPort(parseInt(e.target.value) || 587)} className="credential-form__input" />
                </div>
              </div>
            </>
          )}

          {/* Manual Server Configuration — Calendar */}
          {showManual && !selectedProvider && serviceType === 'calendar' && (
            <div className="credential-form__server-grid">
              <div className="credential-form__field">
                <label className="credential-form__field-label">{t('screen.credentials.label_caldav')}</label>
                <input type="text" value={caldavHost} onChange={e => setCaldavHost(e.target.value)} placeholder="caldav.example.com" className="credential-form__input" />
              </div>
              <div className="credential-form__field">
                <label className="credential-form__field-label">{t('screen.credentials.label_port')}</label>
                <input type="number" value={caldavPort} onChange={e => setCaldavPort(parseInt(e.target.value) || 443)} className="credential-form__input" />
              </div>
            </div>
          )}

          {/* TLS Toggle */}
          <label className="credential-form__tls-row">
            <input
              type="checkbox"
              checked={useTLS}
              onChange={e => setUseTLS(e.target.checked)}
              className="credential-form__tls-checkbox"
            />
            <span className="credential-form__tls-label">{t('screen.credentials.use_tls')}</span>
          </label>

          {/* Privacy Badge */}
          <div className="credential-form__privacy">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            {t('screen.credentials.privacy_notice')}
          </div>

          {/* Test Result */}
          {testResult && (
            <div className={`credential-form__result ${testResult.success ? 'credential-form__result--success' : 'credential-form__result--error'}`}>
              {testResult.success ? t('screen.credentials.test_success') : t('screen.credentials.test_fail', { error: testResult.error })}
            </div>
          )}

          {/* Actions */}
          <div className="credential-form__actions">
            <button
              type="button"
              onClick={handleTest}
              disabled={!isFormValid || testing}
              className="credential-form__btn-test"
            >
              {testing ? t('status.testing') : t('screen.credentials.btn_test')}
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={!testResult?.success || saving}
              className="credential-form__btn-save"
            >
              {saving ? t('screen.credentials.saving') : t('button.save')}
            </button>

            <button
              type="button"
              onClick={onCancel}
              className="credential-form__btn-cancel"
            >
              {t('button.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
