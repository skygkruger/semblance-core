import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet } from 'react-native';
import { FoundingMemberBadge } from '../FoundingMemberBadge/FoundingMemberBadge';
import type { BriefingCardProps } from './BriefingCard.types';
import { DOT_COLORS } from './BriefingCard.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily, opalSurface } from '../../tokens/native';

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
    <View style={styles.card}>
      {/* Header region */}
      <View style={styles.headerRegion}>
        <View style={styles.dateRow}>
          <Text style={styles.date}>{briefDate}</Text>
          {isFoundingMember && foundingSeat != null && (
            <FoundingMemberBadge seat={foundingSeat} variant="inline" />
          )}
        </View>
        <Text style={styles.greeting}>{greeting}</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...opalSurface,
    borderRadius: nativeRadius.lg,
    padding: nativeSpacing.s4,
    gap: nativeSpacing.s3,
  },
  headerRegion: {
    gap: nativeSpacing.s1,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s2,
  },
  date: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.xs,
    color: brandColors.sv2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  greeting: {
    fontFamily: nativeFontFamily.display,
    fontSize: nativeFontSize.lg,
    color: brandColors.white,
    marginTop: nativeSpacing.s1,
  },
  divider: {
    height: 1,
    backgroundColor: brandColors.b2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontFamily: nativeFontFamily.uiMedium,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timestamp: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.xs,
    color: brandColors.sv1,
  },
  items: {
    gap: nativeSpacing.s3,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: nativeSpacing.s3,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
  },
  itemText: {
    flex: 1,
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.base,
    color: brandColors.wDim,
    lineHeight: 22,
  },
});
