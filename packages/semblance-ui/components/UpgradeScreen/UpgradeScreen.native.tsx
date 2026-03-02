import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Button } from '../Button/Button';
import { LicenseActivation } from '../LicenseActivation/LicenseActivation';
import type { UpgradeScreenProps } from './UpgradeScreen.types';
import { FEATURES } from './UpgradeScreen.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily, opalSurface } from '../../tokens/native';

function CheckMark() {
  return (
    <View style={checkStyles.container}>
      <Text style={checkStyles.icon}>{'\u2713'}</Text>
    </View>
  );
}

const checkStyles = StyleSheet.create({
  container: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  icon: {
    fontSize: 12,
    color: brandColors.veridian,
  },
});

function FeatureList({ features, bonus }: { features: readonly string[]; bonus?: string }) {
  return (
    <View style={featureStyles.list}>
      {features.map((f) => (
        <View key={f} style={featureStyles.item}>
          <CheckMark />
          <Text style={featureStyles.text}>{f}</Text>
        </View>
      ))}
      {bonus != null && (
        <View style={featureStyles.item}>
          <CheckMark />
          <Text style={featureStyles.bonusText}>{bonus}</Text>
        </View>
      )}
    </View>
  );
}

const featureStyles = StyleSheet.create({
  list: {
    gap: nativeSpacing.s2,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: nativeSpacing.s2,
  },
  text: {
    flex: 1,
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv3,
    lineHeight: 20,
  },
  bonusText: {
    flex: 1,
    fontFamily: nativeFontFamily.uiMedium,
    fontSize: nativeFontSize.sm,
    color: brandColors.veridian,
    lineHeight: 20,
  },
});

export function UpgradeScreen({
  currentTier,
  isFoundingMember,
  foundingSeat,
  onCheckout,
  onActivateKey,
  onManageSubscription,
  onBack,
}: UpgradeScreenProps) {
  const { t } = useTranslation();
  const isActive = currentTier !== 'free';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {onBack && (
        <Pressable
          onPress={onBack}
          style={styles.back}
          hitSlop={8}
          accessibilityLabel={t('button.back')}
        >
          <Text style={styles.backText}>{'\u2190'} Back</Text>
        </Pressable>
      )}

      <View style={styles.header}>
        <Text style={styles.title}>
          {isActive ? 'Your Plan' : 'Upgrade Semblance'}
        </Text>
        <Text style={styles.subtitle}>
          {isActive
            ? `You're on the ${currentTier === 'digital-representative' ? 'Digital Representative' : currentTier === 'founding' ? 'Founding Member' : 'Lifetime'} plan.`
            : 'The paid tier keeps Semblance independent and in your hands.'}
        </Text>
      </View>

      {!isActive && (
        <View style={styles.plans}>
          {/* Monthly */}
          <View style={styles.plan}>
            <View style={styles.planHeader}>
              <Text style={styles.planLabel}>MONTHLY</Text>
              <View style={styles.priceRow}>
                <Text style={styles.priceAmount}>$18</Text>
                <Text style={styles.pricePeriod}>/mo</Text>
              </View>
            </View>
            <FeatureList features={FEATURES} />
            <Button variant="ghost" size="md" onPress={() => onCheckout('monthly')}>
              Start Monthly
            </Button>
          </View>

          {/* Founding -- recommended */}
          <View style={[styles.plan, styles.planRecommended]}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>RECOMMENDED</Text>
            </View>
            <View style={styles.planHeader}>
              <Text style={styles.planLabel}>FOUNDING THOUSAND</Text>
              <View style={styles.priceRow}>
                <Text style={styles.priceAmount}>$199</Text>
                <Text style={styles.pricePeriod}>lifetime</Text>
              </View>
            </View>
            <Text style={styles.planNote}>
              Limited to 500 seats. Permanent recognition. Everything included, forever.
            </Text>
            <FeatureList
              features={FEATURES}
              bonus={t('upgrade.founding_bonus')}
            />
            <Button variant="solid" size="md" onPress={() => onCheckout('founding')}>
              Become a Founder
            </Button>
          </View>

          {/* Lifetime */}
          <View style={styles.plan}>
            <View style={styles.planHeader}>
              <Text style={styles.planLabel}>LIFETIME</Text>
              <View style={styles.priceRow}>
                <Text style={styles.priceAmount}>$349</Text>
                <Text style={styles.pricePeriod}>one-time</Text>
              </View>
            </View>
            <FeatureList features={FEATURES} />
            <Button variant="ghost" size="md" onPress={() => onCheckout('lifetime')}>
              Get Lifetime Access
            </Button>
          </View>
        </View>
      )}

      {isActive && isFoundingMember && foundingSeat !== null && (
        <View style={styles.activeInfo}>
          <Text style={styles.activeTier}>{t('screen.upgrade.active_founding', { seat: foundingSeat })}</Text>
          <Text style={styles.activeNote}>{t('screen.upgrade.active_note_lifetime')}</Text>
        </View>
      )}

      {isActive && currentTier === 'digital-representative' && onManageSubscription && (
        <View style={styles.activeInfo}>
          <Text style={styles.activeTier}>{t('license.digital_representative')}</Text>
          <Text style={styles.activeNote}>{t('screen.upgrade.active_note_dr')}</Text>
          <Button variant="ghost" size="sm" onPress={onManageSubscription}>
            Manage Subscription
          </Button>
        </View>
      )}

      {isActive && currentTier === 'lifetime' && !isFoundingMember && (
        <View style={styles.activeInfo}>
          <Text style={styles.activeTier}>{t('license.lifetime')}</Text>
          <Text style={styles.activeNote}>{t('screen.upgrade.active_note_lifetime')}</Text>
        </View>
      )}

      <View style={styles.activation}>
        <View style={styles.activationDivider} />
        <Text style={styles.activationLabel}>{t('screen.upgrade.activation_label')}</Text>
        <LicenseActivation onActivate={onActivateKey} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: brandColors.base,
  },
  content: {
    padding: nativeSpacing.s4,
    paddingBottom: nativeSpacing.s12,
    gap: nativeSpacing.s6,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    minWidth: 44,
  },
  backText: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.base,
    color: brandColors.sv2,
  },
  header: {
    gap: nativeSpacing.s2,
  },
  title: {
    fontFamily: nativeFontFamily.display,
    fontSize: nativeFontSize.xl,
    color: brandColors.white,
  },
  subtitle: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.base,
    color: brandColors.sv2,
    lineHeight: 22,
  },
  plans: {
    gap: nativeSpacing.s4,
  },
  plan: {
    ...opalSurface,
    borderRadius: nativeRadius.lg,
    padding: nativeSpacing.s4,
    gap: nativeSpacing.s4,
  },
  planRecommended: {
    borderColor: brandColors.veridian,
    borderWidth: 1,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(110, 207, 163, 0.12)',
    paddingHorizontal: nativeSpacing.s2,
    paddingVertical: 2,
    borderRadius: nativeRadius.sm,
  },
  badgeText: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.xs,
    color: brandColors.veridian,
    letterSpacing: 0.5,
  },
  planHeader: {
    gap: nativeSpacing.s1,
  },
  planLabel: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.xs,
    color: brandColors.sv2,
    letterSpacing: 1,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: nativeSpacing.s1,
  },
  priceAmount: {
    fontFamily: nativeFontFamily.display,
    fontSize: nativeFontSize.xl,
    color: brandColors.white,
  },
  pricePeriod: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv2,
  },
  planNote: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv2,
    lineHeight: 20,
  },
  activeInfo: {
    ...opalSurface,
    borderRadius: nativeRadius.lg,
    padding: nativeSpacing.s4,
    gap: nativeSpacing.s2,
  },
  activeTier: {
    fontFamily: nativeFontFamily.uiMedium,
    fontSize: nativeFontSize.md,
    color: brandColors.veridian,
  },
  activeNote: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.base,
    color: brandColors.sv2,
  },
  activation: {
    gap: nativeSpacing.s3,
  },
  activationDivider: {
    height: 1,
    backgroundColor: brandColors.b2,
  },
  activationLabel: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv2,
  },
});
