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
  children,
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
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brandColors.s1,
    borderRadius: nativeRadius.lg,
    borderWidth: 1,
    borderColor: brandColors.b1,
    padding: 32,
    gap: 16,
  },
  status: {
    fontFamily: nativeFontFamily.ui,
    fontSize: 14,
    color: brandColors.sv2,
    textAlign: 'center',
  },
  sub: {
    fontFamily: nativeFontFamily.ui,
    fontSize: 12,
    color: 'rgba(133, 147, 164, 0.6)',
    textAlign: 'center',
  },
});
