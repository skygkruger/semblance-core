import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Button } from '../Button/Button';
import { OpalBorderView } from '../OpalBorderView/OpalBorderView.native';
import { brandColors, nativeFontFamily, nativeFontSize, nativeRadius, nativeSpacing } from '../../tokens/native';
import {
  CAPABILITY_PREVIEW_COPY,
  type CapabilityPreviewProps,
} from './CapabilityPreview.types';

const VERIDIAN_WIRE_BORDER = Array(7).fill(brandColors.veridianWire) as string[];

export function CapabilityPreview({
  feature,
  newSalesEnabled,
  onFoundingCheckout,
  onRedeem,
  onDismiss,
}: CapabilityPreviewProps) {
  const [dismissed, setDismissed] = useState(false);
  const copy = CAPABILITY_PREVIEW_COPY[feature];

  if (dismissed) {
    return null;
  }

  function handleDismiss() {
    setDismissed(true);
    onDismiss?.();
  }

  return (
    <OpalBorderView borderRadius={nativeRadius.lg} borderColors={VERIDIAN_WIRE_BORDER}>
      <View style={styles.container} testID="capability-preview">
        <Text style={styles.badge}>DIGITAL REPRESENTATIVE</Text>
        <Text style={styles.headline}>{copy.headline}</Text>
        <Text style={styles.preview}>{copy.preview}</Text>
        {copy.bullets.map((bullet) => (
          <Text key={bullet} style={styles.bullet}>• {bullet}</Text>
        ))}
        <View style={styles.actions}>
          {newSalesEnabled ? (
            <Button variant="opal" size="sm" onPress={onFoundingCheckout}>
              Join founding members
            </Button>
          ) : (
            <Button variant="opal" size="sm" onPress={onRedeem}>
              View plans
            </Button>
          )}
          <Button variant="ghost" size="sm" onPress={onRedeem}>
            Redeem entitlement
          </Button>
          <Button variant="ghost" size="sm" onPress={handleDismiss}>
            Not right now
          </Button>
        </View>
        <Text style={styles.footnote}>
          Preview only — activating Digital Representative requires a signed paid entitlement on this device.
        </Text>
      </View>
    </OpalBorderView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: nativeSpacing.s6,
    gap: nativeSpacing.s3,
  },
  badge: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.xs,
    color: brandColors.veridian,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  headline: {
    fontFamily: nativeFontFamily.display,
    fontSize: nativeFontSize.lg,
    color: brandColors.white,
  },
  preview: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.base,
    color: brandColors.sv3,
    lineHeight: 22,
  },
  bullet: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv2,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: nativeSpacing.s3,
    marginTop: nativeSpacing.s2,
  },
  footnote: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.xs,
    color: brandColors.sv3,
    lineHeight: 18,
  },
});
