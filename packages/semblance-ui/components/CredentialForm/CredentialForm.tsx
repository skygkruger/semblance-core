/**
 * CredentialForm — Account setup form for email and calendar credentials.
 *
 * Supports provider presets (Gmail, Outlook, etc.) that pre-fill connection details.
 * Password field is masked with show/hide toggle.
 * Connection test must succeed before save is enabled.
 * All credential data stays local — privacy badge reinforces this.
 */

import { useState, useCallback } from 'react';

export interface ProviderPreset {
  name: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  caldavUrl: string | null;
  notes: string | null;
}

export interface CredentialFormData {
  serviceType: 'email' | 'calendar';
  protocol: 'imap' | 'smtp' | 'caldav';
  host: string;
  port: number;
  username: string;
  password: string;
  useTLS: boolean;
  displayName: string;
}

interface CredentialFormProps {
  serviceType: 'email' | 'calendar';
  presets?: Record<string, ProviderPreset>;
  onSave: (credentials: CredentialFormData[]) => Promise<void>;
  onTest: (credential: CredentialFormData) => Promise<{ success: boolean; error?: string }>;
  onCancel: () => void;
}

const PROVIDERS = ['gmail', 'outlook', 'icloud', 'fastmail', 'protonmail'];
const PROVIDER_LABELS: Record<string, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  icloud: 'iCloud',
  fastmail: 'Fastmail',
  protonmail: 'Proton Mail',
};

export function CredentialForm({ serviceType, presets, onSave, onTest, onCancel }: CredentialFormProps) {
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

  const selectProvider = useCallback((key: string) => {
    setSelectedProvider(key);
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
      setShowManual(false);
    }
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
  }, [serviceType, imapHost, imapPort, smtpHost, smtpPort, caldavHost, caldavPort, username, password, useTLS, displayName, onTest]);

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

  return (
    <div className="space-y-6">
      {/* Provider Selection */}
      <div>
        <label className="block text-sm font-medium text-semblance-text-secondary dark:text-semblance-text-secondary-dark mb-3">
          Choose a provider
        </label>
        <div className="flex flex-wrap gap-2">
          {PROVIDERS.map(key => (
            <button
              key={key}
              type="button"
              onClick={() => selectProvider(key)}
              className={`px-4 py-2 text-sm rounded-md border transition-colors duration-fast ${
                selectedProvider === key
                  ? 'border-semblance-primary bg-semblance-primary-subtle dark:bg-semblance-primary-subtle-dark text-semblance-primary font-medium'
                  : 'border-semblance-border dark:border-semblance-border-dark text-semblance-text-secondary dark:text-semblance-text-secondary-dark hover:border-semblance-primary/50'
              }`}
            >
              {PROVIDER_LABELS[key] ?? key}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { setSelectedProvider(null); setShowManual(true); }}
            className={`px-4 py-2 text-sm rounded-md border transition-colors duration-fast ${
              showManual && !selectedProvider
                ? 'border-semblance-primary bg-semblance-primary-subtle dark:bg-semblance-primary-subtle-dark text-semblance-primary font-medium'
                : 'border-semblance-border dark:border-semblance-border-dark text-semblance-text-secondary dark:text-semblance-text-secondary-dark hover:border-semblance-primary/50'
            }`}
          >
            Other
          </button>
        </div>
      </div>

      {/* Provider Note */}
      {providerNote && (
        <div className="px-4 py-3 rounded-md bg-semblance-accent-subtle dark:bg-semblance-accent-subtle/10 text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
          {providerNote}
        </div>
      )}

      {/* Credential Fields */}
      {(selectedProvider || showManual) && (
        <div className="space-y-4">
          {/* Display Name */}
          <div>
            <label className="block text-xs font-medium text-semblance-text-tertiary mb-1.5">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="e.g., Work Email"
              className="w-full px-4 py-3 text-sm rounded-md border border-semblance-border dark:border-semblance-border-dark bg-semblance-surface-1 dark:bg-semblance-surface-1-dark text-semblance-text-primary dark:text-semblance-text-primary-dark focus:outline-none focus:shadow-focus"
            />
          </div>

          {/* Email / Username */}
          <div>
            <label className="block text-xs font-medium text-semblance-text-tertiary mb-1.5">Email Address</label>
            <input
              type="email"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3 text-sm rounded-md border border-semblance-border dark:border-semblance-border-dark bg-semblance-surface-1 dark:bg-semblance-surface-1-dark text-semblance-text-primary dark:text-semblance-text-primary-dark focus:outline-none focus:shadow-focus"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-medium text-semblance-text-tertiary mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="App password or account password"
                className="w-full px-4 py-3 pr-12 text-sm rounded-md border border-semblance-border dark:border-semblance-border-dark bg-semblance-surface-1 dark:bg-semblance-surface-1-dark text-semblance-text-primary dark:text-semblance-text-primary-dark focus:outline-none focus:shadow-focus"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-semblance-muted hover:text-semblance-text-secondary transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  {showPassword ? (
                    <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></>
                  ) : (
                    <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>
                  )}
                </svg>
              </button>
            </div>
          </div>

          {/* Manual Server Configuration */}
          {showManual && !selectedProvider && serviceType === 'email' && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-semblance-text-tertiary mb-1.5">IMAP Server</label>
                  <input type="text" value={imapHost} onChange={e => setImapHost(e.target.value)} placeholder="imap.example.com" className="w-full px-3 py-2 text-sm rounded-md border border-semblance-border dark:border-semblance-border-dark bg-semblance-surface-1 dark:bg-semblance-surface-1-dark text-semblance-text-primary dark:text-semblance-text-primary-dark focus:outline-none focus:shadow-focus" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-semblance-text-tertiary mb-1.5">Port</label>
                  <input type="number" value={imapPort} onChange={e => setImapPort(parseInt(e.target.value) || 993)} className="w-full px-3 py-2 text-sm rounded-md border border-semblance-border dark:border-semblance-border-dark bg-semblance-surface-1 dark:bg-semblance-surface-1-dark text-semblance-text-primary dark:text-semblance-text-primary-dark focus:outline-none focus:shadow-focus" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-semblance-text-tertiary mb-1.5">SMTP Server</label>
                  <input type="text" value={smtpHost} onChange={e => setSmtpHost(e.target.value)} placeholder="smtp.example.com" className="w-full px-3 py-2 text-sm rounded-md border border-semblance-border dark:border-semblance-border-dark bg-semblance-surface-1 dark:bg-semblance-surface-1-dark text-semblance-text-primary dark:text-semblance-text-primary-dark focus:outline-none focus:shadow-focus" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-semblance-text-tertiary mb-1.5">Port</label>
                  <input type="number" value={smtpPort} onChange={e => setSmtpPort(parseInt(e.target.value) || 587)} className="w-full px-3 py-2 text-sm rounded-md border border-semblance-border dark:border-semblance-border-dark bg-semblance-surface-1 dark:bg-semblance-surface-1-dark text-semblance-text-primary dark:text-semblance-text-primary-dark focus:outline-none focus:shadow-focus" />
                </div>
              </div>
            </div>
          )}

          {showManual && !selectedProvider && serviceType === 'calendar' && (
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-semblance-text-tertiary mb-1.5">CalDAV Server</label>
                <input type="text" value={caldavHost} onChange={e => setCaldavHost(e.target.value)} placeholder="caldav.example.com" className="w-full px-3 py-2 text-sm rounded-md border border-semblance-border dark:border-semblance-border-dark bg-semblance-surface-1 dark:bg-semblance-surface-1-dark text-semblance-text-primary dark:text-semblance-text-primary-dark focus:outline-none focus:shadow-focus" />
              </div>
              <div>
                <label className="block text-xs font-medium text-semblance-text-tertiary mb-1.5">Port</label>
                <input type="number" value={caldavPort} onChange={e => setCaldavPort(parseInt(e.target.value) || 443)} className="w-full px-3 py-2 text-sm rounded-md border border-semblance-border dark:border-semblance-border-dark bg-semblance-surface-1 dark:bg-semblance-surface-1-dark text-semblance-text-primary dark:text-semblance-text-primary-dark focus:outline-none focus:shadow-focus" />
              </div>
            </div>
          )}

          {/* TLS Toggle */}
          <label className="flex items-center gap-2 text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
            <input
              type="checkbox"
              checked={useTLS}
              onChange={e => setUseTLS(e.target.checked)}
              className="w-4 h-4 rounded border-semblance-border accent-semblance-primary"
            />
            Use TLS (recommended)
          </label>

          {/* Privacy Badge */}
          <div className="flex items-center gap-2 text-xs text-semblance-success">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            Your credentials stay on this device. No data is transmitted until you click Test Connection.
          </div>

          {/* Test Result */}
          {testResult && (
            <div className={`px-4 py-3 rounded-md text-sm ${
              testResult.success
                ? 'bg-semblance-success-subtle dark:bg-semblance-success/10 text-semblance-success'
                : 'bg-semblance-attention-subtle dark:bg-semblance-attention/10 text-semblance-attention'
            }`}>
              {testResult.success ? 'Connected successfully!' : `Connection failed: ${testResult.error}`}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={!isFormValid || testing}
              className="px-5 py-2.5 text-sm font-medium rounded-md border border-semblance-primary text-semblance-primary hover:bg-semblance-primary-subtle dark:hover:bg-semblance-primary-subtle-dark transition-colors duration-fast disabled:opacity-50 disabled:pointer-events-none"
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={!testResult?.success || saving}
              className="px-5 py-2.5 text-sm font-medium rounded-full bg-semblance-primary text-white hover:bg-semblance-primary-hover transition-colors duration-fast disabled:opacity-50 disabled:pointer-events-none"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>

            <button
              type="button"
              onClick={onCancel}
              className="px-5 py-2.5 text-sm text-semblance-text-tertiary hover:text-semblance-text-secondary transition-colors duration-fast"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
