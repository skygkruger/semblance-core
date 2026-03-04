/**
 * ShimmerText — Animated gradient text using Skia + Reanimated.
 *
 * Replicates the CSS `background-clip: text` shimmer/opal gradient animations
 * from the web components. Uses matchFont to reference system-linked fonts,
 * then applies a LinearGradient shader to Skia Text with animated sweep.
 *
 * Designed for single-line labels (card titles, greetings, badge text).
 */
import { useEffect } from 'react';
import { View, type ViewStyle } from 'react-native';
import {
  Canvas,
  Text as SkiaText,
  LinearGradient,
  matchFont,
} from '@shopify/react-native-skia';
import {
  useSharedValue,
  withRepeat,
  withTiming,
  useDerivedValue,
  Easing,
} from 'react-native-reanimated';

// ─── Gradient Presets ───
// Each matches the corresponding CSS keyframe/gradient on web.

const GRADIENTS = {
  /** Steel-blue/silver/sage — onboarding headers, card titles */
  shimmer: {
    colors: [
      '#63778a', '#7a94b0', '#8aa4b8', '#b8cdd8',
      '#8fa8a0', '#7a9e8e', '#8fa8a0', '#b8cdd8',
      '#8aa4b8', '#7a94b0', '#63778a',
    ],
    positions: [0, 0.1, 0.2, 0.3, 0.42, 0.5, 0.58, 0.7, 0.8, 0.9, 1],
    duration: 19000,
  },
  /** Opal purple/silver — FoundingMemberBadge */
  opal: {
    colors: [
      '#6b5fa8', '#9aa8b8', '#d8dde8', '#9aa8b8',
      '#6b5fa8', '#9aa8b8', '#6b5fa8',
    ],
    positions: [0, 0.18, 0.36, 0.54, 0.72, 0.9, 1],
    duration: 16000,
  },
  /** Accentuated shimmer — MorningBriefCard label */
  shimmerAccent: {
    colors: [
      '#4a6278', '#6888a8', '#7a9ab8', '#c8dde8',
      '#7ab89a', '#5a9e78', '#7ab89a', '#c8dde8',
      '#7a9ab8', '#6888a8', '#4a6278',
    ],
    positions: [0, 0.1, 0.2, 0.3, 0.42, 0.5, 0.58, 0.7, 0.8, 0.9, 1],
    duration: 19000,
  },
} as const;

type GradientPreset = keyof typeof GRADIENTS;

interface ShimmerTextProps {
  children: string;
  fontSize: number;
  fontFamily: string;
  fontWeight?: string;
  gradient?: GradientPreset;
  style?: ViewStyle;
}

export function ShimmerText({
  children,
  fontSize,
  fontFamily,
  fontWeight,
  gradient = 'shimmer',
  style,
}: ShimmerTextProps) {
  const preset = GRADIENTS[gradient];
  const fontStyle: Parameters<typeof matchFont>[0] = { fontFamily, fontSize };
  if (fontWeight) {
    (fontStyle as Record<string, unknown>).fontWeight = fontWeight;
  }
  const font = matchFont(fontStyle);

  const textWidth = font.getTextWidth(children);
  const canvasWidth = Math.ceil(textWidth + 4);
  const canvasHeight = Math.ceil(fontSize * 1.4);
  const baseline = Math.ceil(fontSize * 1.1);

  // Start partway through the sweep (matching CSS animation-delay: -6s on 19s cycle)
  const initialProgress = gradient === 'opal' ? 0 : 6 / 19;

  const progress = useSharedValue(initialProgress);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: preset.duration, easing: Easing.linear }),
      -1,
      false,
    );
  }, [preset.duration]);

  // Sweep right to left (matching CSS background-position: 200% → -100%)
  const gradientSpan = canvasWidth * 3;

  const startPt = useDerivedValue(() => {
    'worklet';
    const x = (1 - progress.value) * gradientSpan * 2 - gradientSpan;
    return { x, y: 0 };
  });

  const endPt = useDerivedValue(() => {
    'worklet';
    const x = (1 - progress.value) * gradientSpan * 2;
    return { x, y: 0 };
  });

  return (
    <View style={[{ width: canvasWidth, height: canvasHeight }, style]}>
      <Canvas style={{ width: canvasWidth, height: canvasHeight }}>
        <SkiaText x={0} y={baseline} text={children} font={font}>
          <LinearGradient
            start={startPt}
            end={endPt}
            colors={[...preset.colors]}
            positions={[...preset.positions]}
          />
        </SkiaText>
      </Canvas>
    </View>
  );
}
