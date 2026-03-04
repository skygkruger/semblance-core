import { Pressable, StyleSheet } from 'react-native';
import type { CardProps } from './Card.types';
import { OpalBorderView } from '../OpalBorderView/OpalBorderView.native';
import { brandColors, nativeSpacing, nativeRadius } from '../../tokens/native';

export function Card({
  children,
  variant = 'default',
  hoverable = false,
  onPress,
  onClick,
}: CardProps) {
  const handlePress = onPress ?? onClick;
  const isElevated = variant === 'elevated';
  const isBriefing = variant === 'briefing';

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        (handlePress || hoverable) && pressed && styles.pressed,
      ]}
      accessibilityRole={handlePress ? 'button' : 'none'}
      disabled={!handlePress && !hoverable}
    >
      <OpalBorderView
        style={styles.base}
        borderRadius={nativeRadius.lg}
        backgroundColor={isElevated ? brandColors.s2 : undefined}
        shimmerOverlay={!isBriefing}
      >
        {children}
      </OpalBorderView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    padding: nativeSpacing.s6,
  },
  pressed: {
    opacity: 0.85,
  },
});
