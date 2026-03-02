import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { ActionCardProps } from './ActionCard.types';
import { statusLabel } from './ActionCard.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily, opalSurface } from '../../tokens/native';

const STATUS_DOT_COLORS: Record<ActionCardProps['status'], string> = {
  success: brandColors.veridian,
  pending: brandColors.amber,
  error: brandColors.rust,
  rejected: brandColors.sv1,
};

export function ActionCard({
  timestamp,
  actionType,
  description,
  status,
  autonomyTier,
  detail,
}: ActionCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.toggle}
        onPress={() => setExpanded(!expanded)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <View style={[styles.dot, { backgroundColor: STATUS_DOT_COLORS[status] }]} />
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.type}>{actionType}</Text>
            <Text style={styles.timestamp}>{timestamp}</Text>
          </View>
          <Text style={styles.description}>{description}</Text>
          <View style={styles.meta}>
            <Text style={styles.metaItem}>{statusLabel[status]}</Text>
            <Text style={styles.metaSep}>{'\u00B7'}</Text>
            <Text style={styles.metaItem}>{autonomyTier}</Text>
          </View>
        </View>
        <Text style={[styles.chevron, expanded && styles.chevronExpanded]}>
          {'\u276F'}
        </Text>
      </Pressable>
      {expanded && detail && (
        <View style={styles.detail}>
          {detail}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...opalSurface,
    borderRadius: nativeRadius.lg,
    overflow: 'hidden',
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: nativeSpacing.s4,
    gap: nativeSpacing.s3,
    minHeight: 44,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  content: {
    flex: 1,
    gap: nativeSpacing.s1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  type: {
    fontFamily: nativeFontFamily.uiMedium,
    fontSize: nativeFontSize.sm,
    color: brandColors.white,
  },
  timestamp: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.xs,
    color: brandColors.sv2,
  },
  description: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv3,
    lineHeight: 18,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s2,
    marginTop: nativeSpacing.s1,
  },
  metaItem: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.xs,
    color: brandColors.sv1,
    textTransform: 'uppercase',
  },
  metaSep: {
    fontSize: nativeFontSize.xs,
    color: brandColors.sv1,
  },
  chevron: {
    fontSize: 12,
    color: brandColors.sv2,
    marginTop: 4,
    transform: [{ rotate: '90deg' }],
  },
  chevronExpanded: {
    transform: [{ rotate: '180deg' }],
  },
  detail: {
    paddingHorizontal: nativeSpacing.s4,
    paddingBottom: nativeSpacing.s4,
    borderTopWidth: 1,
    borderTopColor: brandColors.b1,
  },
});
