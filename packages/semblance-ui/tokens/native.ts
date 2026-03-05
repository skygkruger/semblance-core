// Native design tokens for React Native StyleSheet.create()
// Re-exports existing token values as numeric/string primitives (no CSS units).
// Source of truth: tokens.css + docs/DESIGN_BIBLE.md

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
  caution: '#B09A8A',
  critical: '#B07A8A',
  // Shimmer — static midpoint of the onboarding shimmer gradient (web animates this)
  shimmerText: '#b8cdd8',
  // Semantic aliases used by native components
  silver: '#8593A4',
  text: '#EEF1F4',
  muted: '#5E6B7C',
} as const;

// Dashboard identity gradient ramps — used by health, financial, privacy dashboards
export const dashboardIdentity = {
  sovereignty: {
    stops: ['#63778a', '#7a94b0', '#8aa4b8', '#b8cdd8', '#8fa8a0', '#7a9e8e'],
    tint: 'rgba(110, 207, 163, 0.04)',
  },
  financial: {
    stops: ['#8a7e74', '#a8968a', '#b8a89e', '#d4c4b8', '#c8b8a8', '#b0a090'],
    tint: 'rgba(176, 154, 138, 0.04)',
  },
  health: {
    stops: ['#5a7a64', '#6e9474', '#82a888', '#a8c8a8', '#8eb898', '#72a07c'],
    tint: 'rgba(110, 168, 144, 0.04)',
  },
  privacy: {
    stops: ['#687078', '#808890', '#98a0a8', '#b8c0c8', '#98a0a8', '#808890'],
    tint: 'rgba(160, 165, 175, 0.03)',
  },
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
  sm: 4,
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

// Opal surface — simplified style for React Native View (legacy, use nativeSurfaces)
export const opalSurface = {
  backgroundColor: '#111518',
  borderWidth: 1,
  borderColor: 'rgba(107,95,168,0.15)',
} as const;

// Surface system — 4 canonical card surfaces for React Native
export const nativeSurfaces = {
  /** Dashboards — dark gradient fill, identity-colored border */
  void: {
    backgroundColor: '#0B0E11',
    borderWidth: 1,
    borderRadius: 12,
  },
  /** Reports, attestations — opal-bordered trust documents */
  opal: {
    backgroundColor: '#121518',
    borderWidth: 1,
    borderColor: 'rgba(107,95,168,0.15)',
    borderRadius: 12,
  },
  /** Notifications, actions — transient cards */
  slate: {
    backgroundColor: '#171B1F',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 12,
  },
  /** Drafting, replies — compose surfaces (wrapper, no bg) */
  compose: {
    borderLeftWidth: 0,
  },
} as const;

// Surface void border colors per identity — used for borderColor on native
export const nativeSurfaceIdentity = {
  sovereignty: { borderColor: 'rgba(138,164,184,0.5)' },
  financial: { borderColor: 'rgba(184,168,158,0.5)' },
  health: { borderColor: 'rgba(130,168,136,0.5)' },
  privacy: { borderColor: 'rgba(152,160,168,0.5)' },
} as const;

// Left bar colors per identity — used for the 3px left bar on native
export const nativeLeftBarColors = {
  sovereignty: ['#63778a', '#7a94b0', '#8aa4b8', '#b8cdd8', '#8fa8a0', '#7a9e8e', '#63778a'],
  financial: ['#8a7e74', '#a8968a', '#b8a89e', '#d4c4b8', '#c8b8a8', '#b0a090', '#8a7e74'],
  health: ['#5a7a64', '#6e9474', '#82a888', '#a8c8a8', '#8eb898', '#72a07c', '#5a7a64'],
  privacy: ['#687078', '#808890', '#98a0a8', '#b8c0c8', '#98a0a8', '#808890', '#687078'],
  veridian: ['rgba(110,207,163,0.55)', 'rgba(110,207,163,0.65)', 'rgba(110,207,163,0.75)', 'rgba(110,207,163,0.85)', 'rgba(110,207,163,0.75)', 'rgba(110,207,163,0.65)', 'rgba(110,207,163,0.55)'],
  opal: ['rgba(97,88,128,0.55)', 'rgba(119,110,162,0.65)', 'rgba(154,168,184,0.75)', 'rgba(216,221,232,0.85)', 'rgba(154,168,184,0.75)', 'rgba(119,110,162,0.65)', 'rgba(97,88,128,0.55)'],
} as const;

// Button opal variant colors per identity — border + text for native
export const nativeBtnOpal = {
  default: { border: 'rgba(152,160,168,0.5)', text: '#98a0a8' },
  sovereignty: { border: 'rgba(138,164,184,0.5)', text: '#8aa4b8' },
  financial: { border: 'rgba(184,168,158,0.5)', text: '#b8a89e' },
  health: { border: 'rgba(130,168,136,0.5)', text: '#82a888' },
  privacy: { border: 'rgba(152,160,168,0.5)', text: '#98a0a8' },
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
