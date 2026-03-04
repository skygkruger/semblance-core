import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet } from 'react-native';
import type { FoundingMemberBadgeProps } from './FoundingMemberBadge.types';
import { ShimmerText } from '../ShimmerText/ShimmerText.native';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';

const OPAL_TEXT = '#9aa8b8';
const OPAL_BG = 'rgba(74,63,107,0.10)';
const OPAL_BORDER = 'rgba(107,95,168,0.32)';

export function FoundingMemberBadge({ seat, variant = 'inline' }: FoundingMemberBadgeProps) {
  const { t } = useTranslation();

  if (variant === 'card') {
    return (
      <View style={styles.card}>
        <Text style={styles.cardLabel}>FOUNDING MEMBER</Text>
        <ShimmerText
          fontSize={nativeFontSize['2xl']}
          fontFamily={nativeFontFamily.mono}
          gradient="opal"
          style={styles.cardSeatContainer}
        >
          {`#${String(seat).padStart(3, '0')}`}
        </ShimmerText>
        <Text style={styles.cardOf}>1 of 500</Text>
      </View>
    );
  }

  return (
    <View style={styles.inline}>
      <View style={styles.inlineDot} />
      <ShimmerText
        fontSize={nativeFontSize.xs}
        fontFamily={nativeFontFamily.mono}
        gradient="opal"
      >
        {t('screen.upgrade.active_founding', { seat })}
      </ShimmerText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: OPAL_BG,
    borderWidth: 1,
    borderColor: OPAL_BORDER,
    borderRadius: nativeRadius.lg,
    paddingVertical: nativeSpacing.s6,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  cardLabel: {
    fontSize: nativeFontSize.xs,
    fontFamily: nativeFontFamily.mono,
    color: brandColors.sv2,
    letterSpacing: 1.32,
    textTransform: 'uppercase',
  },
  cardSeatContainer: {
    marginTop: nativeSpacing.s2,
  },
  cardOf: {
    fontSize: nativeFontSize.xs,
    fontFamily: nativeFontFamily.mono,
    color: brandColors.sv1,
    marginTop: nativeSpacing.s1,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s2,
    borderWidth: 1,
    borderColor: OPAL_BORDER,
    borderRadius: nativeRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 2,
    backgroundColor: OPAL_BG,
  },
  inlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: OPAL_TEXT,
  },
});
