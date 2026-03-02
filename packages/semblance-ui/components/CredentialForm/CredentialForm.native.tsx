import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, TextInput, Pressable, Switch, ScrollView, StyleSheet } from 'react-native';
import type { CredentialFormProps, CredentialFormData } from './CredentialForm.types';
import { PROVIDERS, PROVIDER_LABELS } from './CredentialForm.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';

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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Provider Selection */}
      <Text style={styles.label}>{t('screen.credentials.choose_provider')}</Text>
      <View style={styles.providerRow}>
        {PROVIDERS.map(key => (
          <Pressable
            key={key}
            style={[styles.providerBtn, selectedProvider === key && styles.providerBtnActive]}
            onPress={() => selectProvider(key)}
          >
            <Text style={[styles.providerBtnText, selectedProvider === key && styles.providerBtnTextActive]}>
              {PROVIDER_LABELS[key] ?? key}
            </Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.providerBtn, (showManual && !selectedProvider) && styles.providerBtnActive]}
          onPress={() => { setSelectedProvider(null); setShowManual(true); }}
        >
          <Text style={[styles.providerBtnText, (showManual && !selectedProvider) && styles.providerBtnTextActive]}>
            Other
          </Text>
        </Pressable>
      </View>

      {providerNote && (
        <View style={styles.noteBox}>
          <Text style={styles.noteText}>{providerNote}</Text>
        </View>
      )}

      {(selectedProvider || showManual) && (
        <View style={styles.fields}>
          <Text style={styles.fieldLabel}>{t('screen.credentials.label_display_name')}</Text>
          <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} placeholder="e.g., Work Email" placeholderTextColor={brandColors.sv1} />

          <Text style={styles.fieldLabel}>{t('screen.credentials.label_email')}</Text>
          <TextInput style={styles.input} value={username} onChangeText={setUsername} placeholder="you@example.com" placeholderTextColor={brandColors.sv1} keyboardType="email-address" autoCapitalize="none" />

          <Text style={styles.fieldLabel}>{t('screen.credentials.label_password')}</Text>
          <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder={t('placeholder.password')} placeholderTextColor={brandColors.sv1} secureTextEntry={!showPassword} />
          <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
            <Text style={styles.togglePassword}>{showPassword ? 'Hide' : 'Show'} password</Text>
          </Pressable>

          {/* TLS Toggle */}
          <View style={styles.tlsRow}>
            <Switch
              value={useTLS}
              onValueChange={setUseTLS}
              trackColor={{ false: brandColors.slate2, true: brandColors.veridian }}
            />
            <Text style={styles.tlsLabel}>{t('screen.credentials.use_tls')}</Text>
          </View>

          {/* Privacy Badge */}
          <Text style={styles.privacyNote}>
            Your credentials stay on this device. No data is transmitted until you tap Test Connection.
          </Text>

          {testResult && (
            <View style={[styles.resultBox, testResult.success ? styles.resultSuccess : styles.resultError]}>
              <Text style={[styles.resultText, { color: testResult.success ? brandColors.veridian : brandColors.rust }]}>
                {testResult.success ? 'Connected successfully!' : `Connection failed: ${testResult.error}`}
              </Text>
            </View>
          )}

          <View style={styles.actionRow}>
            <Pressable
              style={[styles.outlineBtn, (!isFormValid || testing) && styles.btnDisabled]}
              onPress={handleTest}
              disabled={!isFormValid || testing}
            >
              <Text style={styles.outlineBtnText}>{testing ? 'Testing...' : 'Test Connection'}</Text>
            </Pressable>
            <Pressable
              style={[styles.solidBtn, (!testResult?.success || saving) && styles.btnDisabled]}
              onPress={handleSave}
              disabled={!testResult?.success || saving}
            >
              <Text style={styles.solidBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
            </Pressable>
            <Pressable style={styles.ghostBtn} onPress={onCancel}>
              <Text style={styles.ghostBtnText}>{t('button.cancel')}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: nativeSpacing.s4,
    gap: nativeSpacing.s4,
  },
  label: {
    fontFamily: nativeFontFamily.uiMedium,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv3,
    marginBottom: nativeSpacing.s2,
  },
  providerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: nativeSpacing.s2,
  },
  providerBtn: {
    paddingHorizontal: nativeSpacing.s4,
    paddingVertical: nativeSpacing.s2,
    borderRadius: nativeRadius.md,
    borderWidth: 1,
    borderColor: brandColors.b2,
    minHeight: 44,
    justifyContent: 'center',
  },
  providerBtnActive: {
    borderColor: brandColors.veridian,
    backgroundColor: 'rgba(110, 207, 163, 0.08)',
  },
  providerBtnText: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv3,
  },
  providerBtnTextActive: {
    color: brandColors.veridian,
    fontFamily: nativeFontFamily.uiMedium,
  },
  noteBox: {
    backgroundColor: 'rgba(201, 168, 92, 0.08)',
    borderRadius: nativeRadius.md,
    padding: nativeSpacing.s3,
  },
  noteText: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv3,
  },
  fields: {
    gap: nativeSpacing.s3,
  },
  fieldLabel: {
    fontFamily: nativeFontFamily.uiMedium,
    fontSize: nativeFontSize.xs,
    color: brandColors.sv1,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: brandColors.b2,
    borderRadius: nativeRadius.md,
    paddingHorizontal: nativeSpacing.s4,
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.white,
    backgroundColor: brandColors.s1,
  },
  togglePassword: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.xs,
    color: brandColors.veridian,
  },
  tlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s2,
  },
  tlsLabel: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv3,
  },
  privacyNote: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.xs,
    color: brandColors.veridian,
    lineHeight: 16,
  },
  resultBox: {
    borderRadius: nativeRadius.md,
    padding: nativeSpacing.s3,
  },
  resultSuccess: {
    backgroundColor: 'rgba(110, 207, 163, 0.08)',
  },
  resultError: {
    backgroundColor: 'rgba(201, 123, 110, 0.08)',
  },
  resultText: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
  },
  actionRow: {
    flexDirection: 'row',
    gap: nativeSpacing.s3,
    marginTop: nativeSpacing.s2,
  },
  outlineBtn: {
    paddingHorizontal: nativeSpacing.s5,
    paddingVertical: nativeSpacing.s3,
    borderRadius: nativeRadius.md,
    borderWidth: 1,
    borderColor: brandColors.veridian,
    minHeight: 44,
    justifyContent: 'center',
  },
  outlineBtnText: {
    fontFamily: nativeFontFamily.uiMedium,
    fontSize: nativeFontSize.sm,
    color: brandColors.veridian,
  },
  solidBtn: {
    paddingHorizontal: nativeSpacing.s5,
    paddingVertical: nativeSpacing.s3,
    borderRadius: nativeRadius.full,
    backgroundColor: brandColors.veridian,
    minHeight: 44,
    justifyContent: 'center',
  },
  solidBtnText: {
    fontFamily: nativeFontFamily.uiMedium,
    fontSize: nativeFontSize.sm,
    color: '#FFFFFF',
  },
  ghostBtn: {
    paddingHorizontal: nativeSpacing.s5,
    paddingVertical: nativeSpacing.s3,
    minHeight: 44,
    justifyContent: 'center',
  },
  ghostBtnText: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv1,
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
