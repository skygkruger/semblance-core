import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, TextInput, Pressable, Switch, ScrollView, StyleSheet } from 'react-native';
import type { CredentialFormProps, CredentialFormData } from './CredentialForm.types';
import { OpalBorderView } from '../OpalBorderView/OpalBorderView.native';
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
    <OpalBorderView borderRadius={nativeRadius.lg} style={styles.card}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>{title}</Text>

        {/* Provider Selection */}
        <Text style={styles.sectionLabel}>{t('screen.credentials.choose_provider')}</Text>
      <View style={styles.providerRow}>
        {providerKeys.map(key => (
          <Pressable
            key={key}
            style={[styles.chip, selectedProvider === key && styles.chipActive]}
            onPress={() => selectProvider(key)}
            hitSlop={4}
          >
            <Text style={[styles.chipText, selectedProvider === key && styles.chipTextActive]}>
              {presets?.[key]?.name ?? key}
            </Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.chip, (showManual && !selectedProvider) && styles.chipActive]}
          onPress={() => { setSelectedProvider(null); setShowManual(true); setTestResult(null); }}
          hitSlop={4}
        >
          <Text style={[styles.chipText, (showManual && !selectedProvider) && styles.chipTextActive]}>
            {t('screen.credentials.other')}
          </Text>
        </Pressable>
      </View>

      {providerNote && (
        <View style={styles.noteBox}>
          <Text style={styles.noteText}>{providerNote}</Text>
        </View>
      )}

      {showFields && (
        <View style={styles.fields}>
          {/* Display Name */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{t('screen.credentials.label_display_name')}</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder={t('placeholder.display_name')}
              placeholderTextColor={brandColors.sv1}
            />
          </View>

          {/* Email / Username */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{t('screen.credentials.label_email')}</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder={t('placeholder.email_address')}
              placeholderTextColor={brandColors.sv1}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          {/* Password */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{t('screen.credentials.label_password')}</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder={t('placeholder.password')}
              placeholderTextColor={brandColors.sv1}
              secureTextEntry={!showPassword}
            />
            <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
              <Text style={styles.togglePassword}>
                {showPassword ? t('screen.credentials.hide_password') : t('screen.credentials.show_password')}
              </Text>
            </Pressable>
          </View>

          {/* Manual Server Configuration — Email */}
          {showManual && !selectedProvider && serviceType === 'email' && (
            <>
              <View style={styles.serverRow}>
                <View style={styles.serverHost}>
                  <Text style={styles.fieldLabel}>{t('screen.credentials.label_imap')}</Text>
                  <TextInput style={styles.input} value={imapHost} onChangeText={setImapHost} placeholder="imap.example.com" placeholderTextColor={brandColors.sv1} autoCapitalize="none" />
                </View>
                <View style={styles.serverPort}>
                  <Text style={styles.fieldLabel}>{t('screen.credentials.label_port')}</Text>
                  <TextInput style={styles.input} value={String(imapPort)} onChangeText={v => setImapPort(parseInt(v) || 993)} keyboardType="number-pad" placeholderTextColor={brandColors.sv1} />
                </View>
              </View>
              <View style={styles.serverRow}>
                <View style={styles.serverHost}>
                  <Text style={styles.fieldLabel}>{t('screen.credentials.label_smtp')}</Text>
                  <TextInput style={styles.input} value={smtpHost} onChangeText={setSmtpHost} placeholder="smtp.example.com" placeholderTextColor={brandColors.sv1} autoCapitalize="none" />
                </View>
                <View style={styles.serverPort}>
                  <Text style={styles.fieldLabel}>{t('screen.credentials.label_port')}</Text>
                  <TextInput style={styles.input} value={String(smtpPort)} onChangeText={v => setSmtpPort(parseInt(v) || 587)} keyboardType="number-pad" placeholderTextColor={brandColors.sv1} />
                </View>
              </View>
            </>
          )}

          {/* Manual Server Configuration — Calendar */}
          {showManual && !selectedProvider && serviceType === 'calendar' && (
            <View style={styles.serverRow}>
              <View style={styles.serverHost}>
                <Text style={styles.fieldLabel}>{t('screen.credentials.label_caldav')}</Text>
                <TextInput style={styles.input} value={caldavHost} onChangeText={setCaldavHost} placeholder="caldav.example.com" placeholderTextColor={brandColors.sv1} autoCapitalize="none" />
              </View>
              <View style={styles.serverPort}>
                <Text style={styles.fieldLabel}>{t('screen.credentials.label_port')}</Text>
                <TextInput style={styles.input} value={String(caldavPort)} onChangeText={v => setCaldavPort(parseInt(v) || 443)} keyboardType="number-pad" placeholderTextColor={brandColors.sv1} />
              </View>
            </View>
          )}

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
          <Text style={styles.privacyNote}>{t('screen.credentials.privacy_notice')}</Text>

          {/* Test Result */}
          {testResult && (
            <View style={[styles.resultBox, testResult.success ? styles.resultSuccess : styles.resultError]}>
              <Text style={[styles.resultText, { color: testResult.success ? brandColors.veridian : brandColors.critical }]}>
                {testResult.success ? t('screen.credentials.test_success') : t('screen.credentials.test_fail', { error: testResult.error })}
              </Text>
            </View>
          )}

          {/* Actions */}
          <View style={styles.actionRow}>
            <Pressable
              style={[styles.btnTest, (!isFormValid || testing) && styles.btnDisabled]}
              onPress={handleTest}
              disabled={!isFormValid || testing}
            >
              <Text style={styles.btnTestText}>{testing ? t('status.testing') : t('screen.credentials.btn_test')}</Text>
            </Pressable>
            <Pressable
              style={[styles.btnSave, (!testResult?.success || saving) && styles.btnDisabled]}
              onPress={handleSave}
              disabled={!testResult?.success || saving}
            >
              <Text style={styles.btnSaveText}>{saving ? t('screen.credentials.saving') : t('button.save')}</Text>
            </Pressable>
            <Pressable style={styles.btnCancel} onPress={onCancel}>
              <Text style={styles.btnCancelText}>{t('button.cancel')}</Text>
            </Pressable>
          </View>
        </View>
      )}
      </ScrollView>
    </OpalBorderView>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: brandColors.s1,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: nativeSpacing.s8,
    gap: nativeSpacing.s6,
  },
  title: {
    fontFamily: nativeFontFamily.uiMedium,
    fontSize: nativeFontSize.sm,
    color: brandColors.wDim,
  },
  sectionLabel: {
    fontFamily: nativeFontFamily.ui,
    fontWeight: '300',
    fontSize: nativeFontSize.xs,
    color: brandColors.sv1,
    marginBottom: nativeSpacing.s3,
  },
  providerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: nativeSpacing.s2,
  },
  chip: {
    paddingHorizontal: nativeSpacing.s4,
    paddingVertical: nativeSpacing.s2,
    borderRadius: nativeRadius.md,
    borderWidth: 1,
    borderColor: brandColors.b2,
    minHeight: 44,
    justifyContent: 'center',
  },
  chipActive: {
    borderColor: brandColors.veridian,
    backgroundColor: brandColors.veridianGlow,
  },
  chipText: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv3,
  },
  chipTextActive: {
    color: brandColors.veridian,
    fontFamily: nativeFontFamily.uiMedium,
  },
  noteBox: {
    backgroundColor: 'rgba(176, 154, 138, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(176, 154, 138, 0.12)',
    borderRadius: nativeRadius.md,
    padding: nativeSpacing.s3,
  },
  noteText: {
    fontFamily: nativeFontFamily.ui,
    fontWeight: '300',
    fontSize: nativeFontSize.sm,
    color: brandColors.sv3,
    lineHeight: 20,
  },
  fields: {
    gap: nativeSpacing.s4,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.xs,
    color: brandColors.sv1,
    textTransform: 'uppercase',
    letterSpacing: 0.88,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: brandColors.b2,
    borderRadius: nativeRadius.md,
    paddingHorizontal: nativeSpacing.s4,
    fontFamily: nativeFontFamily.ui,
    fontWeight: '300',
    fontSize: nativeFontSize.sm,
    color: brandColors.wDim,
    backgroundColor: brandColors.s1,
  },
  togglePassword: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.xs,
    color: brandColors.veridian,
    marginTop: 4,
  },
  serverRow: {
    flexDirection: 'row',
    gap: nativeSpacing.s3,
  },
  serverHost: {
    flex: 2,
    gap: 6,
  },
  serverPort: {
    flex: 1,
    gap: 6,
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
    borderWidth: 1,
    padding: nativeSpacing.s3,
  },
  resultSuccess: {
    backgroundColor: 'rgba(110, 207, 163, 0.08)',
    borderColor: 'rgba(110, 207, 163, 0.12)',
  },
  resultError: {
    backgroundColor: 'rgba(176, 122, 138, 0.08)',
    borderColor: 'rgba(176, 122, 138, 0.12)',
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
  btnTest: {
    paddingHorizontal: nativeSpacing.s5,
    paddingVertical: 10,
    borderRadius: nativeRadius.md,
    borderWidth: 1,
    borderColor: brandColors.veridianWire,
    minHeight: 44,
    justifyContent: 'center',
  },
  btnTestText: {
    fontFamily: nativeFontFamily.uiMedium,
    fontSize: nativeFontSize.sm,
    color: brandColors.veridian,
  },
  btnSave: {
    paddingHorizontal: nativeSpacing.s5,
    paddingVertical: 10,
    borderRadius: nativeRadius.full,
    backgroundColor: brandColors.veridian,
    minHeight: 44,
    justifyContent: 'center',
  },
  btnSaveText: {
    fontFamily: nativeFontFamily.uiMedium,
    fontSize: nativeFontSize.sm,
    color: '#FFFFFF',
  },
  btnCancel: {
    paddingHorizontal: nativeSpacing.s5,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  btnCancelText: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv1,
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
