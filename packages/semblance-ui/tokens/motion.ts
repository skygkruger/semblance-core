// Design tokens: Motion
// Source of truth: docs/DESIGN_SYSTEM.md

export const duration = {
  fast: '150ms',       // Micro-interactions (hover, toggle, checkbox)
  normal: '250ms',     // Standard transitions (panels, tabs, cards)
  slow: '400ms',       // Major transitions (page changes, modal open/close)
  cinematic: '800ms',  // Onboarding, first-run experience only
} as const;

export const easing = {
  out: 'cubic-bezier(0.16, 1, 0.3, 1)',        // Default for most transitions
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',     // Symmetrical moves (accordion, expand/collapse)
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)', // Subtle bounce for success states
} as const;

// Predefined animation patterns
export const motionPresets = {
  cardHover: {
    transform: 'translateY(-2px)',
    shadow: 'lg',
    duration: duration.fast,
    easing: easing.out,
  },
  panelExpand: {
    duration: duration.normal,
    easing: easing.inOut,
  },
  modalOpen: {
    transform: 'scale(0.95) -> scale(1)',
    opacity: '0 -> 1',
    duration: duration.normal,
    easing: easing.out,
  },
  modalClose: {
    transform: 'scale(1) -> scale(0.98)',
    opacity: '1 -> 0',
    duration: duration.fast,
    easing: easing.out,
  },
  loadingPulse: {
    opacity: '0.4 <-> 1',
    duration: '1500ms',
    easing: easing.inOut,
  },
  successCheck: {
    duration: duration.slow,
    easing: easing.spring,
  },
  attentionGlow: {
    duration: '2000ms',
    easing: easing.inOut,
  },
  toastEnter: {
    transform: 'translateY(16px) -> translateY(0)',
    opacity: '0 -> 1',
    duration: duration.normal,
    easing: easing.out,
  },
  onboarding: {
    duration: duration.cinematic,
    easing: easing.out,
  },
} as const;

// CSS custom property names
export const motionTokens = {
  '--duration-fast': duration.fast,
  '--duration-normal': duration.normal,
  '--duration-slow': duration.slow,
  '--duration-cinematic': duration.cinematic,
  '--ease-out': easing.out,
  '--ease-in-out': easing.inOut,
  '--ease-spring': easing.spring,
} as const;
