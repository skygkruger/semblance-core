// Design tokens: Breakpoints
// Source of truth: docs/DESIGN_SYSTEM.md
// Mobile-first: base styles are mobile, use min-width media queries to add complexity.

export const breakpoints = {
  sm: '640px',     // Large phones (landscape)
  md: '768px',     // Tablets (portrait)
  lg: '1024px',    // Tablets (landscape), small laptops
  xl: '1280px',    // Laptops
  '2xl': '1536px', // Desktops
} as const;

// Layout grid specifications
export const layoutGrid = {
  desktop: {
    columns: 12,
    gutter: '24px',
    maxContentWidth: '1200px',
    alignment: 'centered',
  },
  tablet: {
    columns: 8,
    gutter: '20px',
    pageMargin: '16px',
  },
  mobile: {
    columns: 4,
    gutter: '16px',
    pageMargin: '16px',
  },
} as const;

// CSS custom property names
export const breakpointTokens = {
  '--bp-sm': breakpoints.sm,
  '--bp-md': breakpoints.md,
  '--bp-lg': breakpoints.lg,
  '--bp-xl': breakpoints.xl,
  '--bp-2xl': breakpoints['2xl'],
} as const;

// Helper for media queries
export const mediaQuery = {
  sm: `(min-width: ${breakpoints.sm})`,
  md: `(min-width: ${breakpoints.md})`,
  lg: `(min-width: ${breakpoints.lg})`,
  xl: `(min-width: ${breakpoints.xl})`,
  '2xl': `(min-width: ${breakpoints['2xl']})`,
} as const;
