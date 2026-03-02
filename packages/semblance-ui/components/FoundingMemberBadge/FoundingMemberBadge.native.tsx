import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet } from 'react-native';
import type { FoundingMemberBadgeProps } from './FoundingMemberBadge.types';
import { nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';

const CHAMPAGNE = '#E8D4A0';
const CHAMPAGNE_BG = 'rgba(232,213,163,0.12)';
const CHAMPAGNE_BORDER = 'rgba(232,213,163,0.2)';

export function FoundingMemberBadge({ seat, variant = 'inline' }: FoundingMemberBadgeProps) {
  const { t } = useTranslation();

  if (variant === 'card') {
    return (
      <View style={styles.card}>
        <Text style={styles.cardLabel}>FOUNDING MEMBER</Text>
        <Text style={styles.cardSeat}>#{String(seat).padStart(3, '0')}</Text>
        <Text style={styles.cardOf}>1 of 500</Text>
      </View>
    );
  }

  return (
    <View style={styles.inline}>
      <View style={styles.inlineDot} />
      <Text style={styles.inlineText}>{t('screen.upgrade.active_founding', { seat })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: CHAMPAGNE_BG,
    borderWidth: 1,
    borderColor: CHAMPAGNE_BORDER,
    borderRadius: nativeRadius.lg,
    padding: nativeSpacing.s5,
    alignItems: 'center',
  },
  cardLabel: {
    fontSize: nativeFontSize.xs,
    fontFamily: nativeFontFamily.uiMedium,
    color: CHAMPAGNE,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  cardSeat: {
    fontSize: nativeFontSize['2xl'],
    fontFamily: nativeFontFamily.display,
    color: CHAMPAGNE,
    marginTop: nativeSpacing.s2,
  },
  cardOf: {
    fontSize: nativeFontSize.xs,
    fontFamily: nativeFontFamily.ui,
    color: 'rgba(232,213,163,0.6)',
    marginTop: nativeSpacing.s1,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s2,
  },
  inlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: CHAMPAGNE,
  },
  inlineText: {
    fontSize: nativeFontSize.xs,
    fontFamily: nativeFontFamily.ui,
    color: CHAMPAGNE,
  },
});
