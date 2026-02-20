// Design tokens: Spacing
// Source of truth: docs/DESIGN_SYSTEM.md
// Base unit: 4px

export const spacing = {
  0: '0px',        // No spacing
  1: '4px',        // Tightest grouping (icon + label inline)
  2: '8px',        // Compact grouping (between related elements)
  3: '12px',       // Default inner padding (buttons, badges)
  4: '16px',       // Standard gap between elements
  5: '20px',       // Card inner padding
  6: '24px',       // Section spacing within a card
  8: '32px',       // Gap between cards/sections
  10: '40px',      // Major section separation
  12: '48px',      // Page-level section breaks
  16: '64px',      // Hero spacing, page top padding
  20: '80px',      // Maximum spacing (hero/onboarding)
} as const;

export const containerWidth = {
  sm: '640px',     // Narrow content (settings, forms)
  md: '768px',     // Standard content (chat, detail views)
  lg: '1024px',    // Wide content (dashboard, inbox)
  xl: '1200px',    // Maximum content width
} as const;

// CSS custom property names
export const spacingTokens = {
  '--space-0': spacing[0],
  '--space-1': spacing[1],
  '--space-2': spacing[2],
  '--space-3': spacing[3],
  '--space-4': spacing[4],
  '--space-5': spacing[5],
  '--space-6': spacing[6],
  '--space-8': spacing[8],
  '--space-10': spacing[10],
  '--space-12': spacing[12],
  '--space-16': spacing[16],
  '--space-20': spacing[20],
  '--container-sm': containerWidth.sm,
  '--container-md': containerWidth.md,
  '--container-lg': containerWidth.lg,
  '--container-xl': containerWidth.xl,
} as const;
