import { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import type { StatusIndicatorProps, IndicatorStatus } from './StatusIndicator.types';
import { brandColors } from '../../tokens/native';

const statusColors: Record<IndicatorStatus, string> = {
  success: brandColors.veridian,
  accent: brandColors.veridian,
  attention: brandColors.amber,
  muted: brandColors.silver,
};

export function StatusIndicator({ status, pulse = false }: StatusIndicatorProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!pulse) {
      pulseAnim.setValue(1);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulse, pulseAnim]);

  return (
    <Animated.View
      style={[
        styles.dot,
        { backgroundColor: statusColors[status], opacity: pulseAnim },
      ]}
      accessibilityRole="none"
      accessibilityLabel={`Status: ${status}`}
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
