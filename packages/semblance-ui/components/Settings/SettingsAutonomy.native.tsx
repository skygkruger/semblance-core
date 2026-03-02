import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { BackArrow, GuardianIcon, PartnerIcon, AlterEgoIcon } from './SettingsIcons';
import type { Tier, SettingsAutonomyProps } from './SettingsAutonomy.types';
import { tiers, tierLabels, domains, reviewLabels } from './SettingsAutonomy.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';

const tierIcons: Record<Tier, ReactNode> = {
  guardian: <GuardianIcon />,
  partner: <PartnerIcon />,
  'alter-ego': <AlterEgoIcon />,
};

function Toggle({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onToggle}
      style={[styles.toggle, on && styles.toggleOn, disabled && styles.toggleDisabled]}
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled }}
    >
      <View style={[styles.toggleThumb, on && styles.toggleThumbOn]} />
    </Pressable>
  );
}

export function SettingsAutonomy({
  currentTier,
  domainOverrides,
  requireConfirmationForIrreversible,
  actionReviewWindow,
  onChange,
  onBack,
}: SettingsAutonomyProps) {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation();
  const isGuardian = currentTier === 'guardian';

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.headerBack} accessibilityRole="button" accessibilityLabel={tc('a11y.go_back')}>
          <BackArrow />
        </Pressable>
        <Text style={styles.headerTitle}>{t('autonomy.title')}</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Tier Selector */}
        <View style={{ paddingTop: nativeSpacing.s4 }}>
          {tiers.map((tier) => {
            const isActive = currentTier === tier.id;
            return (
              <Pressable
                key={tier.id}
                style={[styles.tierCard, isActive && styles.tierCardActive]}
                onPress={() => onChange('currentTier', tier.id)}
                accessibilityRole="button"
              >
                <View style={[styles.tierCardIcon, isActive && styles.tierCardIconActive]}>
                  {tierIcons[tier.id]}
                </View>
                <View style={styles.tierCardBody}>
                  <View style={styles.tierCardHeader}>
                    <Text style={styles.tierCardName}>{t(`autonomy.tiers.${tier.id}.name`)}</Text>
                    {isActive && (
                      <View style={styles.badgeVeridian}>
                        <Text style={styles.badgeTextVeridian}>{t('autonomy.badge_active')}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.tierCardDesc} numberOfLines={2}>{t(`autonomy.tiers.${tier.id}.desc`)}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Domain Overrides */}
        <Text style={styles.sectionHeader}>{t('autonomy.section_domain_overrides')}</Text>
        <Text style={[styles.explanation, { marginBottom: nativeSpacing.s3 }]}>
          {t('autonomy.domain_overrides_explanation')}
        </Text>

        {domains.map((domain) => {
          const key = domain.toLowerCase();
          const override = domainOverrides[key] || 'default';
          return (
            <View key={domain} style={styles.rowStatic}>
              <Text style={styles.rowLabel}>{t(`autonomy.domains.${key}`)}</Text>
              <Text style={styles.rowValue}>{tierLabels[override]}</Text>
            </View>
          );
        })}

        {/* Safety */}
        <Text style={styles.sectionHeader}>{t('autonomy.section_safety')}</Text>

        <Pressable
          style={({ pressed }) => [styles.row, pressed && !isGuardian && styles.rowPressed]}
          onPress={isGuardian ? undefined : () => onChange('requireConfirmationForIrreversible', !requireConfirmationForIrreversible)}
          accessibilityRole="button"
        >
          <Text style={styles.rowLabel}>{t('autonomy.label_require_confirmation')}</Text>
          <Toggle
            on={requireConfirmationForIrreversible}
            onToggle={() => onChange('requireConfirmationForIrreversible', !requireConfirmationForIrreversible)}
            disabled={isGuardian}
          />
        </Pressable>

        <View style={styles.rowStatic}>
          <Text style={styles.rowLabel}>{t('autonomy.label_action_review_window')}</Text>
          <Text style={styles.rowValue}>{reviewLabels[actionReviewWindow]}</Text>
        </View>

        <Text style={[styles.explanationSmall, { paddingTop: nativeSpacing.s2 }]}>
          {t('autonomy.irreversible_actions_explanation')}
        </Text>
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
  tierCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: nativeSpacing.s3,
    padding: nativeSpacing.s4,
    marginHorizontal: nativeSpacing.s4,
    marginBottom: nativeSpacing.s2,
    height: 82,
    backgroundColor: brandColors.s2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: nativeRadius.lg,
  },
  tierCardActive: {
    backgroundColor: brandColors.s1,
    borderColor: 'rgba(110, 207, 163, 0.4)',
  },
  tierCardIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    flexShrink: 0,
  },
  tierCardIconActive: {
    // Icon color is handled by the icon component color prop
    // This is a placeholder for active state styling
  },
  tierCardBody: {
    flex: 1,
  },
  tierCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s2,
    height: 22,
    marginBottom: nativeSpacing.s1,
  },
  tierCardName: {
    fontSize: nativeFontSize.base,
    fontWeight: '400',
    color: brandColors.white,
    fontFamily: nativeFontFamily.ui,
  },
  tierCardDesc: {
    fontSize: nativeFontSize.sm,
    fontWeight: '300',
    color: brandColors.sv3,
    lineHeight: 18,
  },
  badgeVeridian: {
    backgroundColor: 'rgba(110, 207, 163, 0.1)',
    paddingHorizontal: nativeSpacing.s2,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeTextVeridian: {
    fontFamily: nativeFontFamily.mono,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: brandColors.veridian,
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
    marginRight: nativeSpacing.s2,
  },
  explanation: {
    paddingHorizontal: nativeSpacing.s5,
    fontSize: nativeFontSize.sm,
    fontWeight: '300',
    color: brandColors.sv3,
    lineHeight: 20,
  },
  explanationSmall: {
    paddingHorizontal: nativeSpacing.s5,
    fontSize: 12,
    color: brandColors.sv1,
    lineHeight: 18,
  },
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleOn: {
    backgroundColor: brandColors.veridian,
  },
  toggleDisabled: {
    opacity: 0.5,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: brandColors.white,
  },
  toggleThumbOn: {
    alignSelf: 'flex-end',
  },
});
