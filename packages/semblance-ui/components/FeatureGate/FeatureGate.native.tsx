import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Button } from '../Button/Button';
import type { FeatureGateProps } from './FeatureGate.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily, opalSurface } from '../../tokens/native';

function DefaultFallback({ onLearnMore }: { onLearnMore?: () => void }) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <View style={styles.locked}>
      <View style={styles.lockedHeader}>
        <Text style={styles.lockIcon}>{'\uD83D\uDD12'}</Text>
        <Text style={styles.lockedLabel}>DIGITAL REPRESENTATIVE</Text>
      </View>

      <View style={styles.lockedDivider} />

      <Text style={styles.lockedBody}>
        This is a Digital Representative feature. It's part of the paid tier that keeps
        Semblance independent and in your hands.
      </Text>
      <Text style={styles.lockedBody}>
        If Semblance has been useful, this is how you support that — and get more from it.
      </Text>

      <View style={styles.lockedActions}>
        <Button variant="solid" size="sm" onPress={onLearnMore}>
          Learn more
        </Button>
        <Button variant="ghost" size="sm" onPress={() => setDismissed(true)}>
          Not right now
        </Button>
      </View>
    </View>
  );
}

export function FeatureGate({
  isPremium,
  children,
  fallback,
  onLearnMore,
}: FeatureGateProps) {
  if (isPremium) {
    return <>{children}</>;
  }

  return <>{fallback ?? <DefaultFallback onLearnMore={onLearnMore} />}</>;
}

const styles = StyleSheet.create({
  locked: {
    ...opalSurface,
    borderRadius: nativeRadius.lg,
    padding: nativeSpacing.s5,
    gap: nativeSpacing.s3,
  },
  lockedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s2,
  },
  lockIcon: {
    fontSize: 16,
  },
  lockedLabel: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.xs,
    color: brandColors.amber,
    letterSpacing: 1,
  },
  lockedDivider: {
    height: 1,
    backgroundColor: brandColors.b2,
  },
  lockedBody: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv3,
    lineHeight: 20,
  },
  lockedActions: {
    flexDirection: 'row',
    gap: nativeSpacing.s3,
    marginTop: nativeSpacing.s1,
  },
});
