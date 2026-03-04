import { useEffect, useRef, useState } from 'react';
import { View, Animated, StyleSheet, Easing } from 'react-native';
import type { ProgressBarProps } from './ProgressBar.types';
import { OpalBorderView } from '../OpalBorderView/OpalBorderView.native';
import { brandColors } from '../../tokens/native';

export function ProgressBar({ value = 0, max = 100, indeterminate = false }: ProgressBarProps) {
  const percentage = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const isComplete = !indeterminate && percentage >= 100;
  const [trackWidth, setTrackWidth] = useState(0);

  const widthAnim = useRef(new Animated.Value(percentage)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Determinate width animation
  useEffect(() => {
    if (indeterminate) return;
    Animated.timing(widthAnim, {
      toValue: percentage,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [percentage, indeterminate, widthAnim]);

  // Indeterminate slide animation — matches web's translateX(-100%) to translateX(350%)
  useEffect(() => {
    if (!indeterminate) {
      slideAnim.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 1400,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [indeterminate, slideAnim]);

  const barWidth = widthAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  // Complete state: solid veridian border, veridian fill, glow
  if (isComplete) {
    return (
      <View
        style={styles.completeTrack}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max, now: value }}
      >
        <View style={styles.completeFill} />
      </View>
    );
  }

  // Fill width for indeterminate is 40% of track (matches web)
  const fillWidth = trackWidth * 0.4;
  // translateX range: -100% to 350% of fill's own width
  const translateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-fillWidth, fillWidth * 3.5],
  });

  return (
    <OpalBorderView borderRadius={4} shimmerOverlay={false}>
      <View
        style={styles.track}
        onLayout={e => {
          const w = e.nativeEvent.layout.width;
          if (w !== trackWidth) setTrackWidth(w);
        }}
        accessibilityRole="progressbar"
        accessibilityValue={{
          min: 0,
          max,
          now: indeterminate ? undefined : value,
        }}
      >
        {indeterminate ? (
          <Animated.View
            style={[
              styles.fill,
              {
                width: '40%',
                transform: [{ translateX }],
              },
            ]}
          />
        ) : (
          <Animated.View style={[styles.fill, { width: barWidth }]} />
        )}
      </View>
    </OpalBorderView>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    height: 8,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
  },
  completeTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(110, 207, 163, 0.5)',
    backgroundColor: '#181B1F',
    // iOS shadow for veridian glow
    shadowColor: brandColors.veridian,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  completeFill: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(110, 207, 163, 0.12)',
    borderRadius: 3,
  },
});
