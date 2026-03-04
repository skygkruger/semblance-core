/**
 * OpalBorderView — Animated opal sweep gradient border + shimmer overlay.
 *
 * Replicates the CSS `opal-surface` system from opal.css:
 *   - Rotating conic-gradient border (opal-border-sweep 8s linear infinite)
 *   - Screen-blended shimmer overlay (opal-sweep 8s linear infinite)
 *   - Dark background fill (#111518)
 *
 * Uses @shopify/react-native-skia for gradient rendering and
 * react-native-reanimated for 60fps animation on the UI thread.
 *
 * Drop-in replacement for the static `...opalSurface` style spread.
 */
import { useState, useEffect, type ReactNode } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import {
  Canvas,
  RoundedRect,
  SweepGradient,
  LinearGradient,
  Group,
} from '@shopify/react-native-skia';
import {
  useSharedValue,
  withRepeat,
  withTiming,
  useDerivedValue,
  Easing,
} from 'react-native-reanimated';

// ─── Border gradient colors ───
// Matches CSS: conic-gradient(from var(--opal-angle), ...)

export const OPAL_BORDER_COLORS = [
  'rgba(97,88,128,0.35)',
  'rgba(119,110,162,0.45)',
  'rgba(154,168,184,0.55)',
  'rgba(216,221,232,0.6)',
  'rgba(154,168,184,0.55)',
  'rgba(119,110,162,0.45)',
  'rgba(97,88,128,0.35)',
];

/** Dimmed variant for user chat bubbles */
export const USER_BORDER_COLORS = [
  'rgba(97,88,128,0.18)',
  'rgba(119,110,162,0.24)',
  'rgba(154,168,184,0.30)',
  'rgba(216,221,232,0.34)',
  'rgba(154,168,184,0.30)',
  'rgba(119,110,162,0.24)',
  'rgba(97,88,128,0.18)',
];

// ─── Shimmer overlay gradient ───
// Matches CSS ::before pseudo-element with mix-blend-mode: screen

const SHIMMER_OVERLAY_COLORS = [
  'rgba(0,0,0,0)',
  'rgba(0,0,0,0)',
  'rgba(74,63,107,0.0)',
  'rgba(107,95,168,0.06)',
  'rgba(154,168,184,0.08)',
  'rgba(216,221,232,0.11)',
  'rgba(216,221,232,0.08)',
  'rgba(154,168,184,0.06)',
  'rgba(107,95,168,0.03)',
  'rgba(0,0,0,0)',
  'rgba(0,0,0,0)',
];

const SHIMMER_OVERLAY_POSITIONS = [
  0, 0.15, 0.20, 0.32, 0.44, 0.52, 0.58, 0.66, 0.76, 0.85, 1,
];

interface OpalBorderViewProps {
  children: ReactNode;
  borderRadius?: number;
  borderWidth?: number;
  backgroundColor?: string;
  style?: StyleProp<ViewStyle>;
  /** Border rotation duration in ms (default: 8000 = 8s, matching CSS) */
  borderDuration?: number;
  /** Shimmer sweep duration in ms (default: 8000 = 8s, matching CSS) */
  shimmerDuration?: number;
  /** Enable the shimmer overlay effect (default: true) */
  shimmerOverlay?: boolean;
  /** Opacity of shimmer overlay (default: 1, use 0.35 for user bubbles) */
  shimmerOpacity?: number;
  /** Override border colors (use USER_BORDER_COLORS for dimmed variant) */
  borderColors?: readonly string[];
}

export function OpalBorderView({
  children,
  borderRadius = 12,
  borderWidth = 1,
  backgroundColor = '#111518',
  style,
  borderDuration = 8000,
  shimmerDuration = 8000,
  shimmerOverlay = true,
  shimmerOpacity = 1,
  borderColors = OPAL_BORDER_COLORS,
}: OpalBorderViewProps) {
  const [layout, setLayout] = useState({ width: 0, height: 0 });

  // ─── Border rotation animation ───
  const borderAngle = useSharedValue(0);
  useEffect(() => {
    borderAngle.value = withRepeat(
      withTiming(360, { duration: borderDuration, easing: Easing.linear }),
      -1,
      false,
    );
  }, [borderDuration]);

  const startAngle = useDerivedValue(() => {
    'worklet';
    return borderAngle.value;
  });
  const endAngle = useDerivedValue(() => {
    'worklet';
    return borderAngle.value + 360;
  });

  // ─── Shimmer sweep animation ───
  // Start at 50% to match CSS animation-delay: -4s on an 8s cycle
  const shimmerProgress = useSharedValue(0.5);
  useEffect(() => {
    if (!shimmerOverlay) return;
    shimmerProgress.value = withRepeat(
      withTiming(1, { duration: shimmerDuration, easing: Easing.linear }),
      -1,
      false,
    );
  }, [shimmerOverlay, shimmerDuration]);

  const { width: w, height: h } = layout;
  const half = borderWidth / 2;
  const center = { x: w / 2, y: h / 2 };

  // Shimmer overlay sweep positions
  const shimmerWidth = w * 2;
  const shimmerStart = useDerivedValue(() => {
    'worklet';
    const x = (1 - shimmerProgress.value) * shimmerWidth * 1.5 - shimmerWidth * 0.25;
    return { x, y: h * 0.27 };
  });
  const shimmerEnd = useDerivedValue(() => {
    'worklet';
    const x = (1 - shimmerProgress.value) * shimmerWidth * 1.5 + shimmerWidth * 0.75;
    return { x, y: 0 };
  });

  return (
    <View
      style={[{ borderRadius, overflow: 'hidden' }, style]}
      onLayout={e => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== layout.width || height !== layout.height) {
          setLayout({ width, height });
        }
      }}
    >
      {w > 0 && h > 0 && (
        <Canvas
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          accessibilityElementsHidden
        >
          {/* Background fill */}
          <RoundedRect
            x={0}
            y={0}
            width={w}
            height={h}
            r={borderRadius}
            color={backgroundColor}
          />

          {/* Shimmer overlay — screen blended on top of background */}
          {shimmerOverlay && (
            <Group blendMode="screen" opacity={shimmerOpacity}>
              <RoundedRect x={0} y={0} width={w} height={h} r={borderRadius}>
                <LinearGradient
                  start={shimmerStart}
                  end={shimmerEnd}
                  colors={SHIMMER_OVERLAY_COLORS}
                  positions={SHIMMER_OVERLAY_POSITIONS}
                />
              </RoundedRect>
            </Group>
          )}

          {/* Animated opal border — rotating sweep gradient */}
          <RoundedRect
            x={half}
            y={half}
            width={w - borderWidth}
            height={h - borderWidth}
            r={Math.max(0, borderRadius - half)}
            style="stroke"
            strokeWidth={borderWidth}
          >
            <SweepGradient
              c={center}
              colors={[...borderColors]}
              start={startAngle}
              end={endAngle}
            />
          </RoundedRect>
        </Canvas>
      )}

      {/* Content rendered above the Skia canvas */}
      <View style={styles.content}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    position: 'relative',
    zIndex: 2,
  },
});
