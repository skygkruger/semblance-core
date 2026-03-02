import { View, Text, StyleSheet } from 'react-native';
import { WireframeSpinner } from '../WireframeSpinner/WireframeSpinner';
import type { SkeletonCardProps } from './SkeletonCard.types';
import { DEFAULT_MESSAGES } from './SkeletonCard.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';

export function SkeletonCard({
  variant = 'generic',
  message,
  subMessage,
  showSpinner = true,
  height = 180,
}: SkeletonCardProps) {
  const defaults = DEFAULT_MESSAGES[variant] ?? DEFAULT_MESSAGES.generic!;
  const displayMessage = message ?? defaults.message;
  const displaySub = subMessage ?? defaults.sub;

  return (
    <View style={[styles.container, { height: typeof height === 'number' ? height : undefined }]}>
      {showSpinner && <WireframeSpinner size={100} />}
      <Text style={styles.status}>{displayMessage}</Text>
      {displaySub && (
        <Text style={styles.sub}>{displaySub}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brandColors.s1,
    borderRadius: nativeRadius.lg,
    borderWidth: 1,
    borderColor: brandColors.b1,
    padding: nativeSpacing.s6,
    gap: nativeSpacing.s3,
  },
  status: {
    fontFamily: nativeFontFamily.display,
    fontSize: nativeFontSize.md,
    color: brandColors.sv3,
    textAlign: 'center',
  },
  sub: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv1,
    textAlign: 'center',
  },
});
