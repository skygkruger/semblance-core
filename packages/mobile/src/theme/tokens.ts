// Mobile Design Tokens — backed by canonical native.ts from @semblance/ui.
// Source of truth: packages/semblance-ui/tokens/native.ts (from DESIGN_BIBLE.md)
// This file maps the mobile API shape to canonical Design Bible values.

import {
  brandColors,
  nativeSpacing,
  nativeRadius,
  nativeFontSize,
  nativeFontFamily,
  nativeFontWeight,
  nativeMotion,
} from '@semblance/ui/tokens/native';

// ─── Colors ─────────────────────────────────────────────────────────────────

export const colors = {
  // Primary palette — Design Bible v3
  bgDark: brandColors.base,
  primary: brandColors.veridian,
  accent: brandColors.caution,
  success: '#3DB87A',
  attention: brandColors.critical,
  muted: brandColors.muted,

  // Extended palette — dark mode
  primaryActive: brandColors.veridianGlow,
  primarySubtleDark: brandColors.veridianDim,
  surface1Dark: brandColors.s1,
  surface2Dark: brandColors.s2,
  borderDark: brandColors.b2,
  textPrimaryDark: brandColors.white,
  textSecondaryDark: brandColors.sv3,
  textTertiary: brandColors.sv2,

  // Aliases for screens that reference light-mode names in dark context
  primarySubtle: brandColors.veridianDim,
  successSubtle: 'rgba(61, 184, 122, 0.10)',
  attentionSubtle: 'rgba(176, 122, 138, 0.10)',
  surface1: brandColors.s1,
  border: brandColors.b2,
  textPrimary: brandColors.white,
  textSecondary: brandColors.sv3,
} as const;

// ─── Typography ─────────────────────────────────────────────────────────────

export const typography = {
  fontDisplay: nativeFontFamily.display,
  fontBody: nativeFontFamily.ui,
  fontMono: nativeFontFamily.mono,
  size: nativeFontSize,
  weight: nativeFontWeight,
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.7,
  },
} as const;

// ─── Typography Presets ─────────────────────────────────────────────────────

export const typographyPresets = {
  titleLg: {
    fontFamily: nativeFontFamily.display,
    fontSize: nativeFontSize.lg,
    fontWeight: nativeFontWeight.semibold,
    lineHeight: Math.round(nativeFontSize.lg * 1.2),
  },
  titleMd: {
    fontFamily: nativeFontFamily.display,
    fontSize: nativeFontSize.md,
    fontWeight: nativeFontWeight.semibold,
    lineHeight: Math.round(nativeFontSize.md * 1.2),
  },
  bodySm: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    lineHeight: Math.round(nativeFontSize.sm * 1.5),
  },
  bodyXs: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.xs,
    lineHeight: Math.round(nativeFontSize.xs * 1.5),
  },
} as const;

// ─── Spacing ────────────────────────────────────────────────────────────────

export const spacing = {
  xs: nativeSpacing.s1,
  sm: nativeSpacing.s2,
  md: nativeSpacing.s3,
  base: nativeSpacing.s4,
  lg: nativeSpacing.s5,
  xl: nativeSpacing.s6,
  '2xl': nativeSpacing.s8,
  '3xl': nativeSpacing.s10,
  '4xl': nativeSpacing.s12,
  '5xl': nativeSpacing.s16,
} as const;

// ─── Border Radius ──────────────────────────────────────────────────────────

export const radius = nativeRadius;

// ─── Motion ─────────────────────────────────────────────────────────────────

export const motion = {
  fast: nativeMotion.fast,
  normal: nativeMotion.base,
  slow: nativeMotion.slow,
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
