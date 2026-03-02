import { Pressable, StyleSheet } from 'react-native';
import type { CardProps } from './Card.types';
import { brandColors, nativeSpacing, nativeRadius, opalSurface } from '../../tokens/native';

export function Card({
  children,
  variant = 'default',
  hoverable = false,
  onPress,
  onClick,
}: CardProps) {
  const handlePress = onPress ?? onClick;

  if (handlePress || hoverable) {
    return (
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.base,
          variant === 'elevated' && styles.elevated,
          variant === 'briefing' && styles.briefing,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
      >
        {children}
      </Pressable>
    );
  }

  return (
    <Pressable
      style={[
        styles.base,
        variant === 'elevated' && styles.elevated,
        variant === 'briefing' && styles.briefing,
      ]}
      accessibilityRole="none"
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    ...opalSurface,
    borderRadius: nativeRadius.lg,
    padding: nativeSpacing.s4,
  },
  elevated: {
    backgroundColor: brandColors.s2,
  },
  briefing: {
    borderColor: 'rgba(110,207,163,0.15)',
  },
  pressed: {
    opacity: 0.85,
  },
});
