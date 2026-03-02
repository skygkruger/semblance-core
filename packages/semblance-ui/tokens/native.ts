// Native design tokens for React Native StyleSheet.create()
// Re-exports existing token values as numeric/string primitives (no CSS units).
// Source of truth: tokens.css + docs/SEMBLANCE_BRAND_DESIGN_SYSTEM.md

// Colors — re-exported directly, already hex strings
export { colors, colorTokens } from './colors.js';

// Brand Design System v3 colors (from tokens.css)
export const brandColors = {
  void: '#060809',
  base: '#0B0E11',
  s1: '#111518',
  s2: '#171B1F',
  s3: '#1E2227',
  b1: 'rgba(255, 255, 255, 0.05)',
  b2: 'rgba(255, 255, 255, 0.09)',
  b3: 'rgba(255, 255, 255, 0.15)',
  slate1: '#2A2F35',
  slate2: '#3D444C',
  slate3: '#525A64',
  sv1: '#5E6B7C',
  sv2: '#8593A4',
  sv3: '#A8B4C0',
  wDim: '#CDD4DB',
  white: '#EEF1F4',
  whitePure: '#F8FAFB',
  veridian: '#6ECFA3',
  veridianDim: 'rgba(110, 207, 163, 0.10)',
  veridianGlow: 'rgba(110, 207, 163, 0.08)',
  veridianGlowMd: 'rgba(110, 207, 163, 0.18)',
  veridianGlowLg: 'rgba(110, 207, 163, 0.28)',
  veridianWire: 'rgba(110, 207, 163, 0.32)',
  amber: '#C9A85C',
  rust: '#C97B6E',
  // Semantic aliases used by native components
  silver: '#8593A4',
  text: '#EEF1F4',
  muted: '#5E6B7C',
} as const;

// Spacing — numeric values (no 'px' suffix)
export const nativeSpacing = {
  s0: 0,
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 20,
  s6: 24,
  s8: 32,
  s10: 40,
  s12: 48,
  s16: 64,
  s20: 80,
  s24: 96,
} as const;

// Border radius — numeric values
export const nativeRadius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

// Font sizes — numeric values
export const nativeFontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 17,
  lg: 21,
  xl: 28,
  '2xl': 38,
  '3xl': 52,
} as const;

// Native font families — maps to font file names loaded on device
export const nativeFontFamily = {
  ui: 'DMSans-Regular',
  uiMedium: 'DMSans-Medium',
  mono: 'DMMono-Regular',
  display: 'Fraunces-Light',
  displayItalic: 'Fraunces-LightItalic',
  wordmark: 'JosefinSans-ExtraLight',
} as const;

// Font weights — numeric values for React Native
export const nativeFontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

// Opal surface — simplified style for React Native View
export const opalSurface = {
  backgroundColor: '#111518',
  borderWidth: 1,
  borderColor: 'rgba(107,95,168,0.15)',
} as const;

// Motion — numeric durations in ms for Reanimated
export const nativeMotion = {
  fast: 120,
  base: 220,
  slow: 400,
  slower: 700,
  ambient: 16000,
  cinematic: 800,
} as const;
