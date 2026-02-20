// Design tokens: Typography
// Source of truth: docs/DESIGN_SYSTEM.md

export const fontFamily = {
  ui: 'Inter, system-ui, -apple-system, sans-serif',
  mono: 'JetBrains Mono, ui-monospace, Consolas, monospace',
  display: 'DM Serif Display, Fraunces, Georgia, serif',
} as const;

export const fontSize = {
  xs: '0.6875rem',      // 11px — captions, timestamps, metadata
  sm: '0.8125rem',      // 13px — secondary labels, help text
  base: '1rem',         // 16px — body text, input values
  md: '1.125rem',       // 18px — emphasized body, card titles
  lg: '1.25rem',        // 20px — section headers, modal titles
  xl: '1.5rem',         // 24px — page titles
  '2xl': '1.875rem',    // 30px — major headings
  '3xl': '2.375rem',    // 38px — hero text, onboarding
  display: '3rem',      // 48px — display (DM Serif Display), brand moments only
} as const;

export const fontWeight = {
  regular: 400,         // Body text, descriptions
  medium: 500,          // Emphasized text, active nav items
  semibold: 600,        // Headings, button labels, card titles
  bold: 700,            // Major headings, brand text
} as const;

export const lineHeight = {
  xs: 1.45,
  sm: 1.45,
  base: 1.5,
  md: 1.4,
  lg: 1.35,
  xl: 1.3,
  '2xl': 1.25,
  '3xl': 1.2,
  display: 1.1,
} as const;

// CSS custom property names
export const typographyTokens = {
  '--font-ui': fontFamily.ui,
  '--font-mono': fontFamily.mono,
  '--font-display': fontFamily.display,
  '--text-xs': fontSize.xs,
  '--text-sm': fontSize.sm,
  '--text-base': fontSize.base,
  '--text-md': fontSize.md,
  '--text-lg': fontSize.lg,
  '--text-xl': fontSize.xl,
  '--text-2xl': fontSize['2xl'],
  '--text-3xl': fontSize['3xl'],
  '--text-display': fontSize.display,
  '--font-regular': String(fontWeight.regular),
  '--font-medium': String(fontWeight.medium),
  '--font-semibold': String(fontWeight.semibold),
  '--font-bold': String(fontWeight.bold),
} as const;
