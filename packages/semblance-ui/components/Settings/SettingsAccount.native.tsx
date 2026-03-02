import { useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, StyleSheet } from 'react-native';
import { BackArrow } from './SettingsIcons';
import type { SettingsAccountProps } from './SettingsAccount.types';
import { licenseConfigs } from './SettingsAccount.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';

const badgeColors: Record<string, { text: string; bg: string }> = {
  opal: { text: '#9AA8B8', bg: 'rgba(154, 168, 184, 0.1)' },
  veridian: { text: '#6ECFA3', bg: 'rgba(110, 207, 163, 0.1)' },
  muted: { text: '#8593A4', bg: 'rgba(133, 147, 164, 0.1)' },
  rust: { text: '#C97B6E', bg: 'rgba(201, 123, 110, 0.1)' },
};

const cardBorderColors: Record<string, string> = {
  opal: 'rgba(154, 168, 184, 0.4)',
  active: 'rgba(110, 207, 163, 0.4)',
  default: 'rgba(255, 255, 255, 0.09)',
  rust: 'rgba(201, 123, 110, 0.4)',
};

export function SettingsAccount({
  licenseStatus,
  licenseActivationDate,
  trialDaysRemaining,
  digitalRepresentativeActive,
  digitalRepresentativeActivationDate,
  semblanceName,
  onRenewLicense,
  onActivateDigitalRepresentative,
  onViewDRAgreement,
  onRenameSemblance,
  onSignOut,
  onDeactivateLicense,
  onBack,
}: SettingsAccountProps) {
  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState(semblanceName);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  const config = licenseConfigs[licenseStatus] ?? licenseConfigs['active']!;
  const badgeStyle = badgeColors[config.badgeVariant] ?? badgeColors['muted']!;
  const cardBorder = cardBorderColors[config.cardVariant] ?? cardBorderColors['default']!;

  const handleSaveName = () => {
    if (nameValue.trim()) {
      onRenameSemblance(nameValue.trim());
      setEditing(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.headerBack} accessibilityRole="button" accessibilityLabel="Go back">
          <BackArrow />
        </Pressable>
        <Text style={styles.headerTitle}>Account</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* License Status Card */}
        <View style={{ paddingTop: nativeSpacing.s4 }}>
          <View style={[
            styles.card,
            { borderColor: cardBorder },
            config.cardVariant === 'active' && styles.cardActiveBg,
          ]}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardLabel}>{config.label}</Text>
              <View style={[styles.badge, { backgroundColor: badgeStyle.bg }]}>
                <Text style={[styles.badgeText, { color: badgeStyle.text }]}>{config.badge}</Text>
              </View>
            </View>
            <Text style={styles.cardDesc}>{config.desc}</Text>
            <Text style={styles.cardMeta}>
              {licenseStatus === 'trial' && trialDaysRemaining !== undefined
                ? `${trialDaysRemaining} days remaining`
                : `Activated ${licenseActivationDate}`}
            </Text>
            {licenseStatus === 'expired' && (
              <Pressable
                onPress={onRenewLicense}
                style={({ pressed }) => [styles.ghostButton, { marginTop: nativeSpacing.s3 }, pressed && styles.ghostButtonPressed]}
                accessibilityRole="button"
              >
                <Text style={styles.ghostButtonText}>Renew license</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Digital Representative */}
        <Text style={styles.sectionHeader}>Digital Representative</Text>

        <View style={styles.rowStatic}>
          <Text style={styles.rowLabel}>Status</Text>
          <View style={styles.statusContainer}>
            <View style={[styles.dot, { backgroundColor: digitalRepresentativeActive ? brandColors.veridian : brandColors.sv2 }]} />
            <Text style={styles.rowValue}>
              {digitalRepresentativeActive ? 'Active' : 'Not activated'}
            </Text>
          </View>
        </View>

        {digitalRepresentativeActive && digitalRepresentativeActivationDate && (
          <View style={styles.rowStatic}>
            <Text style={styles.rowLabel}>Activation date</Text>
            <Text style={styles.rowValue}>{digitalRepresentativeActivationDate}</Text>
          </View>
        )}

        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={onViewDRAgreement}
          accessibilityRole="button"
        >
          <Text style={styles.rowLabel}>View Digital Representative agreement</Text>
        </Pressable>

        {!digitalRepresentativeActive && (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={onActivateDigitalRepresentative}
            accessibilityRole="button"
          >
            <Text style={[styles.rowLabel, { color: brandColors.veridian }]}>
              Activate Digital Representative
            </Text>
          </Pressable>
        )}

        {/* Semblance Identity */}
        <Text style={styles.sectionHeader}>Semblance Identity</Text>

        {editing ? (
          <View style={styles.inlineEdit}>
            <TextInput
              style={styles.inlineEditInput}
              value={nameValue}
              onChangeText={setNameValue}
              onSubmitEditing={handleSaveName}
              autoFocus
              placeholderTextColor={brandColors.sv1}
            />
            <Pressable onPress={handleSaveName} style={styles.inlineEditBtn} accessibilityRole="button">
              <Text style={styles.inlineEditBtnSave}>Save</Text>
            </Pressable>
            <Pressable onPress={() => { setEditing(false); setNameValue(semblanceName); }} style={styles.inlineEditBtn} accessibilityRole="button">
              <Text style={styles.inlineEditBtnCancel}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => setEditing(true)}
            accessibilityRole="button"
          >
            <Text style={styles.rowLabel}>Your Semblance&apos;s name</Text>
            <Text style={[styles.rowValue, styles.nameGradient]}>{semblanceName}</Text>
          </Pressable>
        )}

        {/* Danger Zone */}
        <Text style={[styles.sectionHeader, styles.sectionHeaderDanger]}>Danger Zone</Text>

        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={onSignOut}
          accessibilityRole="button"
        >
          <Text style={[styles.rowLabel, { color: brandColors.sv2 }]}>Sign out</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => setConfirmDeactivate(true)}
          accessibilityRole="button"
        >
          <Text style={[styles.rowLabel, styles.dangerLabel]}>Deactivate license</Text>
        </Pressable>

        {confirmDeactivate && (
          <View style={styles.confirmContainer}>
            <Text style={styles.confirmText}>
              Are you sure? This will deactivate your license on this device.
            </Text>
            <View style={styles.confirmRow}>
              <Pressable
                onPress={() => { onDeactivateLicense(); setConfirmDeactivate(false); }}
                style={styles.destructiveButton}
                accessibilityRole="button"
              >
                <Text style={styles.destructiveButtonText}>Deactivate</Text>
              </Pressable>
              <Pressable
                onPress={() => setConfirmDeactivate(false)}
                style={styles.cancelButton}
                accessibilityRole="button"
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: brandColors.base,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: nativeSpacing.s4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  headerBack: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: nativeFontFamily.ui,
    fontWeight: '400',
    fontSize: 16,
    color: brandColors.white,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: nativeSpacing.s8,
  },
  sectionHeader: {
    paddingTop: nativeSpacing.s5,
    paddingBottom: nativeSpacing.s2,
    paddingHorizontal: nativeSpacing.s5,
    fontSize: nativeFontSize.xs,
    fontWeight: '400',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: brandColors.sv1,
    fontFamily: nativeFontFamily.mono,
  },
  sectionHeaderDanger: {
    color: brandColors.rust,
  },
  card: {
    marginHorizontal: nativeSpacing.s4,
    padding: nativeSpacing.s4,
    backgroundColor: brandColors.s2,
    borderWidth: 1,
    borderRadius: nativeRadius.lg,
  },
  cardActiveBg: {
    backgroundColor: brandColors.s1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: nativeSpacing.s2,
  },
  cardLabel: {
    fontSize: nativeFontSize.md,
    fontWeight: '400',
    color: brandColors.white,
    fontFamily: nativeFontFamily.ui,
  },
  cardDesc: {
    fontSize: nativeFontSize.sm,
    color: brandColors.sv3,
    marginBottom: nativeSpacing.s1,
  },
  cardMeta: {
    fontSize: 12,
    fontFamily: nativeFontFamily.mono,
    color: brandColors.sv1,
  },
  badge: {
    paddingHorizontal: nativeSpacing.s2,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontFamily: nativeFontFamily.mono,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: nativeSpacing.s5,
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    gap: nativeSpacing.s2,
  },
  rowStatic: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: nativeSpacing.s5,
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    gap: nativeSpacing.s2,
  },
  rowPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  rowLabel: {
    flex: 1,
    fontSize: nativeFontSize.base,
    color: brandColors.white,
    fontFamily: nativeFontFamily.ui,
    fontWeight: '400',
  },
  rowValue: {
    fontSize: nativeFontSize.sm,
    color: brandColors.sv3,
    fontFamily: nativeFontFamily.mono,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s2,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 9999,
  },
  dangerLabel: {
    color: brandColors.rust,
  },
  nameGradient: {
    // React Native cannot do CSS text gradients; use veridian color as a fallback
    color: brandColors.sv3,
  },
  inlineEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s2,
    paddingHorizontal: nativeSpacing.s5,
    height: 52,
  },
  inlineEditInput: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: nativeRadius.sm,
    paddingHorizontal: nativeSpacing.s3,
    paddingVertical: 6,
    fontSize: nativeFontSize.base,
    fontFamily: nativeFontFamily.ui,
    color: brandColors.white,
    minHeight: 44,
  },
  inlineEditBtn: {
    paddingHorizontal: nativeSpacing.s2,
    paddingVertical: nativeSpacing.s1,
    minHeight: 44,
    justifyContent: 'center',
  },
  inlineEditBtnSave: {
    color: brandColors.veridian,
    fontSize: nativeFontSize.sm,
  },
  inlineEditBtnCancel: {
    color: brandColors.sv2,
    fontSize: nativeFontSize.sm,
  },
  ghostButton: {
    borderWidth: 1,
    borderColor: 'rgba(110, 207, 163, 0.3)',
    borderRadius: nativeRadius.md,
    paddingVertical: nativeSpacing.s2,
    paddingHorizontal: nativeSpacing.s4,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  ghostButtonPressed: {
    backgroundColor: 'rgba(110, 207, 163, 0.08)',
  },
  ghostButtonText: {
    color: brandColors.veridian,
    fontFamily: nativeFontFamily.ui,
    fontSize: 14,
    fontWeight: '400',
  },
  confirmContainer: {
    paddingHorizontal: nativeSpacing.s5,
    paddingVertical: nativeSpacing.s3,
  },
  confirmText: {
    fontSize: nativeFontSize.sm,
    color: brandColors.rust,
    marginBottom: nativeSpacing.s2,
  },
  confirmRow: {
    flexDirection: 'row',
    gap: nativeSpacing.s2,
    alignItems: 'center',
  },
  destructiveButton: {
    backgroundColor: brandColors.rust,
    borderRadius: nativeRadius.sm,
    paddingVertical: nativeSpacing.s2,
    paddingHorizontal: nativeSpacing.s4,
    minHeight: 44,
    justifyContent: 'center',
  },
  destructiveButtonText: {
    color: brandColors.base,
    fontSize: nativeFontSize.sm,
    fontWeight: '500',
  },
  cancelButton: {
    paddingHorizontal: nativeSpacing.s2,
    paddingVertical: nativeSpacing.s1,
    minHeight: 44,
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: brandColors.sv2,
    fontSize: nativeFontSize.sm,
  },
});
