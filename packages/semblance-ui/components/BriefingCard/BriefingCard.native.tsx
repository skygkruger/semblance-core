import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet } from 'react-native';
import { FoundingMemberBadge } from '../FoundingMemberBadge/FoundingMemberBadge';
import { OpalBorderView } from '../OpalBorderView/OpalBorderView.native';
import { ShimmerText } from '../ShimmerText/ShimmerText.native';
import type { BriefingCardProps } from './BriefingCard.types';
import { DOT_COLORS } from './BriefingCard.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';

export function BriefingCard({
  title,
  timestamp,
  items,
  userName,
  isFoundingMember = false,
  foundingSeat,
}: BriefingCardProps) {
  const { t } = useTranslation('morning-brief');
  const resolvedTitle = title ?? t('card.default_title');
  const [_animating, setAnimating] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setAnimating(false), 1100);
    return () => clearTimeout(timer);
  }, []);

  // Compute translated date string
  const now = new Date();
  const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
  const MONTH_KEYS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'] as const;
  const briefDate = `${t(`date.days.${DAY_KEYS[now.getDay()]}`)}, ${t(`date.months.${MONTH_KEYS[now.getMonth()]}`)} ${now.getDate()}`;

  // Compute translated greeting
  const hour = now.getHours();
  const greetingPeriodKey = hour >= 17 ? 'evening' : hour >= 12 ? 'afternoon' : 'morning';
  const period = t(`greeting.${greetingPeriodKey}`);
  const greeting = userName
    ? t('greeting.with_name', { period, name: userName })
    : t('greeting.anonymous', { period });

  return (
    <OpalBorderView
      style={styles.card}
      borderRadius={nativeRadius.lg}
    >
      {/* Header region */}
      <View style={styles.headerRegion}>
        <View style={styles.dateRow}>
          <Text style={styles.date}>{briefDate}</Text>
          {isFoundingMember && foundingSeat != null && (
            <FoundingMemberBadge seat={foundingSeat} variant="inline" />
          )}
        </View>
        <ShimmerText
          fontSize={nativeFontSize.xl}
          fontFamily={nativeFontFamily.display}
          gradient="shimmer"
          style={styles.greetingContainer}
        >
          {greeting}
        </ShimmerText>
      </View>

      <View style={styles.divider} />

      <View style={styles.header}>
        <Text style={styles.title}>{resolvedTitle}</Text>
        {timestamp != null && (
          <Text style={styles.timestamp}>{timestamp}</Text>
        )}
      </View>

      <View style={styles.items}>
        {items.map((item, i) => (
          <View key={i} style={styles.item}>
            <View
              style={[
                styles.dot,
                { backgroundColor: DOT_COLORS[item.type] ?? '#8593A4' },
              ]}
            />
            <Text style={styles.itemText}>{item.text}</Text>
          </View>
        ))}
      </View>
    </OpalBorderView>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: nativeSpacing.s3,
  },
  headerRegion: {
    padding: nativeSpacing.s6,
    paddingBottom: 0,
    gap: nativeSpacing.s1,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s2,
  },
  date: {
    fontFamily: nativeFontFamily.mono,
    fontSize: 12,
    color: brandColors.sv2,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  greetingContainer: {
    marginTop: nativeSpacing.s2,
    marginBottom: nativeSpacing.s5,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginHorizontal: nativeSpacing.s6,
    marginBottom: nativeSpacing.s6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: nativeSpacing.s6,
  },
  title: {
    fontFamily: nativeFontFamily.display,
    fontWeight: '300',
    fontSize: nativeFontSize.xl,
    color: brandColors.wDim,
  },
  timestamp: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.xs,
    color: brandColors.slate3,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  items: {
    marginTop: nativeSpacing.s5,
    paddingHorizontal: nativeSpacing.s6,
    paddingBottom: nativeSpacing.s6,
    gap: nativeSpacing.s3,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  itemText: {
    flex: 1,
    fontFamily: nativeFontFamily.ui,
    fontWeight: '300',
    fontSize: nativeFontSize.base,
    color: brandColors.sv3,
    lineHeight: 24,
  },
});
