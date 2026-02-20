// Design tokens: Shadows
// Source of truth: docs/DESIGN_SYSTEM.md

export const shadows = {
  sm: '0 1px 2px rgba(0,0,0,0.05)',           // Subtle lift (buttons, small elements)
  md: '0 2px 8px rgba(0,0,0,0.08)',           // Cards, panels at rest
  lg: '0 4px 16px rgba(0,0,0,0.12)',          // Elevated cards, dropdowns, popovers
  xl: '0 8px 32px rgba(0,0,0,0.16)',          // Modals, dialogs
  focus: '0 0 0 3px rgba(74,127,186,0.3)',    // Focus ring (Semblance Blue at 30%)
} as const;

// Dark mode shadows use higher opacity base
export const shadowsDark = {
  sm: '0 1px 2px rgba(0,0,0,0.3)',
  md: '0 2px 8px rgba(0,0,0,0.3)',
  lg: '0 4px 16px rgba(0,0,0,0.3)',
  xl: '0 8px 32px rgba(0,0,0,0.3)',
  focus: '0 0 0 3px rgba(74,127,186,0.3)',
} as const;

export const borderRadius = {
  sm: '6px',       // Small elements (badges, chips, tags)
  md: '8px',       // Buttons, inputs, small cards
  lg: '12px',      // Cards, panels, modals
  xl: '16px',      // Large cards, feature panels
  full: '9999px',  // Pill buttons, avatars, status dots
} as const;

// CSS custom property names
export const shadowTokens = {
  '--shadow-sm': shadows.sm,
  '--shadow-md': shadows.md,
  '--shadow-lg': shadows.lg,
  '--shadow-xl': shadows.xl,
  '--shadow-focus': shadows.focus,
  '--radius-sm': borderRadius.sm,
  '--radius-md': borderRadius.md,
  '--radius-lg': borderRadius.lg,
  '--radius-xl': borderRadius.xl,
  '--radius-full': borderRadius.full,
} as const;
