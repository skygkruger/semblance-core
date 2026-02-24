// Design Tokens — React Native equivalent of DESIGN_SYSTEM.md tokens.
// All color, typography, spacing, and motion values from the canonical design system.
// Dark mode is the default on mobile (matches the Deep Ink primary background).

// ─── Colors ─────────────────────────────────────────────────────────────────

export const colors = {
  // Primary palette
  bgDark: '#1A1D2E',
  bgLight: '#FAFBFC',
  primary: '#4A7FBA',
  accent: '#E8A838',
  success: '#3DB87A',
  attention: '#E85D5D',
  muted: '#8B93A7',

  // Extended palette — dark mode
  primaryHover: '#3D6CA3',
  primaryActive: '#325A8A',
  primarySubtleDark: '#1E2A3E',
  accentHover: '#D4952F',
  surface1Dark: '#222538',
  surface2Dark: '#2A2D42',
  borderDark: '#363952',
  textPrimaryDark: '#ECEDF0',
  textSecondaryDark: '#9BA0B0',
  textTertiary: '#8B93A7',

  // Extended palette — light mode
  primarySubtle: '#EBF2F9',
  accentSubtle: '#FFF6E8',
  successSubtle: '#EDFAF2',
  attentionSubtle: '#FEF0F0',
  surface1: '#FFFFFF',
  surface2: '#F5F6F8',
  border: '#E2E4E9',
  textPrimary: '#1A1D2E',
  textSecondary: '#5A6070',
} as const;

// ─── Typography ─────────────────────────────────────────────────────────────

export const typography = {
  // Font families (must be loaded via React Native font linking)
  fontDisplay: 'DM Serif Display',
  fontBody: 'Inter',
  fontMono: 'JetBrains Mono',

  // Font sizes (from DESIGN_SYSTEM.md scale)
  size: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 17,
    lg: 20,
    xl: 24,
    '2xl': 32,
    '3xl': 40,
    '4xl': 48,
  },

  // Font weights
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },

  // Line heights (multiplier)
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.7,
  },
} as const;

// ─── Typography Presets ─────────────────────────────────────────────────────
// Convenience presets matching design system semantic names.
// Spread into StyleSheet.create() for consistent text styling.

export const typographyPresets = {
  titleLg: {
    fontFamily: typography.fontDisplay,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    lineHeight: Math.round(typography.size.lg * typography.lineHeight.tight),
  },
  titleMd: {
    fontFamily: typography.fontDisplay,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    lineHeight: Math.round(typography.size.md * typography.lineHeight.tight),
  },
  bodySm: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    lineHeight: Math.round(typography.size.sm * typography.lineHeight.normal),
  },
  bodyXs: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.xs,
    lineHeight: Math.round(typography.size.xs * typography.lineHeight.normal),
  },
} as const;

// ─── Spacing ────────────────────────────────────────────────────────────────

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
  '5xl': 64,
} as const;

// ─── Border Radius ──────────────────────────────────────────────────────────

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

// ─── Motion ─────────────────────────────────────────────────────────────────

export const motion = {
  /** Fast micro-interactions (button press, toggle) */
  fast: 150,
  /** Standard transitions (panel expand, card move) */
  normal: 250,
  /** Deliberate animations (page transition, modal) */
  slow: 400,
} as const;

// ─── Shadows ────────────────────────────────────────────────────────────────

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;
