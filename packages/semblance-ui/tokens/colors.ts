// Design tokens: Colors
// Source of truth: docs/DESIGN_SYSTEM.md

export const colors = {
  // Primary Palette
  bgDark: '#1A1D2E',              // Deep Ink — primary background (dark mode)
  bgLight: '#FAFBFC',             // Soft White — primary background (light mode)
  primary: '#4A7FBA',             // Semblance Blue — primary brand color
  accent: '#E8A838',              // Warm Amber — secondary accent
  success: '#3DB87A',             // Living Green — active/healthy status
  attention: '#E85D5D',           // Alert Coral — attention needed
  muted: '#8B93A7',               // Muted Slate — secondary text, borders, disabled

  // Extended Palette
  primaryHover: '#3D6CA3',        // Primary color hover state
  primaryActive: '#325A8A',       // Primary color active/pressed state
  primarySubtle: '#EBF2F9',       // Primary tint for backgrounds (light mode)
  primarySubtleDark: '#1E2A3E',   // Primary tint for backgrounds (dark mode)
  accentHover: '#D4952F',         // Accent hover state
  accentSubtle: '#FFF6E8',        // Accent tint for backgrounds (light mode)
  successSubtle: '#EDFAF2',       // Success background tint (light mode)
  attentionSubtle: '#FEF0F0',     // Attention background tint (light mode)
  surface1: '#FFFFFF',            // Card/panel surface (light mode)
  surface1Dark: '#222538',        // Card/panel surface (dark mode)
  surface2: '#F5F6F8',            // Nested/secondary surface (light mode)
  surface2Dark: '#2A2D42',        // Nested/secondary surface (dark mode)
  border: '#E2E4E9',              // Default border (light mode)
  borderDark: '#363952',          // Default border (dark mode)
  textPrimary: '#1A1D2E',        // Primary text (light mode)
  textPrimaryDark: '#ECEDF0',    // Primary text (dark mode)
  textSecondary: '#5A6070',      // Secondary text (light mode)
  textSecondaryDark: '#9BA0B0',  // Secondary text (dark mode)
  textTertiary: '#8B93A7',       // Tertiary/disabled text (both modes)
} as const;

// CSS custom property names for runtime theming
export const colorTokens = {
  '--color-bg-dark': colors.bgDark,
  '--color-bg-light': colors.bgLight,
  '--color-primary': colors.primary,
  '--color-accent': colors.accent,
  '--color-success': colors.success,
  '--color-attention': colors.attention,
  '--color-muted': colors.muted,
  '--color-primary-hover': colors.primaryHover,
  '--color-primary-active': colors.primaryActive,
  '--color-primary-subtle': colors.primarySubtle,
  '--color-primary-subtle-dark': colors.primarySubtleDark,
  '--color-accent-hover': colors.accentHover,
  '--color-accent-subtle': colors.accentSubtle,
  '--color-success-subtle': colors.successSubtle,
  '--color-attention-subtle': colors.attentionSubtle,
  '--color-surface-1': colors.surface1,
  '--color-surface-1-dark': colors.surface1Dark,
  '--color-surface-2': colors.surface2,
  '--color-surface-2-dark': colors.surface2Dark,
  '--color-border': colors.border,
  '--color-border-dark': colors.borderDark,
  '--color-text-primary': colors.textPrimary,
  '--color-text-primary-dark': colors.textPrimaryDark,
  '--color-text-secondary': colors.textSecondary,
  '--color-text-secondary-dark': colors.textSecondaryDark,
  '--color-text-tertiary': colors.textTertiary,
} as const;
