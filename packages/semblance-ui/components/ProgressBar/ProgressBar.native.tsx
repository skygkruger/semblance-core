import { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import type { ProgressBarProps } from './ProgressBar.types';
import { brandColors, nativeRadius } from '../../tokens/native';

export function ProgressBar({ value = 0, max = 100, indeterminate = false }: ProgressBarProps) {
  const percentage = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const widthAnim = useRef(new Animated.Value(percentage)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (indeterminate) return;
    Animated.timing(widthAnim, {
      toValue: percentage,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [percentage, indeterminate, widthAnim]);

  useEffect(() => {
    if (!indeterminate) {
      pulseAnim.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: false }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 1200, useNativeDriver: false }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [indeterminate, pulseAnim]);

  const barWidth = indeterminate
    ? pulseAnim.interpolate({ inputRange: [0, 1], outputRange: ['20%', '80%'] })
    : widthAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });

  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityValue={{
        min: 0,
        max,
        now: indeterminate ? undefined : value,
      }}
    >
      <Animated.View style={[styles.fill, { width: barWidth }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    height: 8,
    backgroundColor: brandColors.s2,
    borderRadius: nativeRadius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: brandColors.veridian,
    borderRadius: nativeRadius.full,
  },
});
