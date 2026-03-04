import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { ActionCardProps } from './ActionCard.types';
import { statusLabel } from './ActionCard.types';
import { OpalBorderView } from '../OpalBorderView/OpalBorderView.native';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';

function formatTierLabel(tier: string): string {
  return tier.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const STATUS_DOT_COLORS: Record<ActionCardProps['status'], string> = {
  success: brandColors.veridian,
  pending: brandColors.veridian,
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
    <OpalBorderView
      borderRadius={nativeRadius.lg}
      style={styles.containerOuter}
    >
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
            <Text style={styles.metaItem}>{formatTierLabel(autonomyTier)}</Text>
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
    </OpalBorderView>
  );
}

const styles = StyleSheet.create({
  containerOuter: {
    // OpalBorderView handles border/bg/shimmer
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: nativeSpacing.s5,
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
    color: brandColors.wDim,
  },
  timestamp: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.xs,
    color: brandColors.sv1,
  },
  description: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    fontWeight: '300',
    color: brandColors.sv3,
    lineHeight: 19.5,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s2,
    marginTop: nativeSpacing.s2,
  },
  metaItem: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.xs,
    color: brandColors.sv1,
  },
  metaSep: {
    fontSize: nativeFontSize.xs,
    color: brandColors.sv1,
  },
  chevron: {
    fontSize: 12,
    color: brandColors.sv1,
    marginTop: 4,
    transform: [{ rotate: '90deg' }],
  },
  chevronExpanded: {
    transform: [{ rotate: '180deg' }],
  },
  detail: {
    paddingTop: nativeSpacing.s4,
    paddingHorizontal: nativeSpacing.s4,
    paddingBottom: nativeSpacing.s4,
    borderTopWidth: 1,
    borderTopColor: brandColors.b1,
  },
});
