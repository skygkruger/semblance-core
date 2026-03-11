import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Button } from '../Button/Button';
import type { FeatureGateProps } from './FeatureGate.types';
import { OpalBorderView } from '../OpalBorderView/OpalBorderView.native';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';

const VERIDIAN_WIRE_BORDER = Array(7).fill(brandColors.veridianWire) as string[];

function DefaultFallback({ onLearnMore }: { onLearnMore?: () => void }) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <OpalBorderView borderRadius={nativeRadius.lg} borderColors={VERIDIAN_WIRE_BORDER}>
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
        <Button variant="opal" size="sm" onPress={onLearnMore}>
          Learn more
        </Button>
        <Button variant="ghost" size="sm" onPress={() => setDismissed(true)}>
          Not right now
        </Button>
      </View>
      </View>
    </OpalBorderView>
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
    padding: nativeSpacing.s6,
    gap: nativeSpacing.s3,
  },
  lockedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s3,
  },
  lockIcon: {
    fontSize: 16,
    color: brandColors.veridian,
  },
  lockedLabel: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.xs,
    color: brandColors.veridian,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  lockedDivider: {
    height: 1,
    backgroundColor: brandColors.veridian,
    maxWidth: 72,
    marginVertical: nativeSpacing.s4,
  },
  lockedBody: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.base,
    color: brandColors.sv3,
    lineHeight: 24,
  },
  lockedActions: {
    flexDirection: 'row',
    gap: nativeSpacing.s3,
    marginTop: nativeSpacing.s1,
  },
});
