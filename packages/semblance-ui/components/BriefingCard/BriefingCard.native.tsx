import { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FoundingMemberBadge } from '../FoundingMemberBadge/FoundingMemberBadge';
import type { BriefingCardProps } from './BriefingCard.types';
import { DOT_COLORS, formatBriefDate, getGreeting } from './BriefingCard.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily, opalSurface } from '../../tokens/native';

export function BriefingCard({
  title = 'Morning Brief',
  timestamp,
  items,
  userName,
  isFoundingMember = false,
  foundingSeat,
}: BriefingCardProps) {
  const [_animating, setAnimating] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setAnimating(false), 1100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.card}>
      {/* Header region */}
      <View style={styles.headerRegion}>
        <View style={styles.dateRow}>
          <Text style={styles.date}>{formatBriefDate()}</Text>
          {isFoundingMember && foundingSeat != null && (
            <FoundingMemberBadge seat={foundingSeat} variant="inline" />
          )}
        </View>
        <Text style={styles.greeting}>{getGreeting(userName)}</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
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
