// Sovereignty Navigator — Route definitions and deep link mappings for sovereignty/privacy/security screens.
// All new screens added in Step 31 are registered here for navigation integration.
// No networking imports. Navigation is purely local.

/**
 * Route definition for sovereignty navigator.
 */
export interface SovereigntyRoute {
  name: string;
  screenKey: string;
  deepLink?: string;
  category: 'sovereignty' | 'privacy' | 'security' | 'adversarial';
  /** Whether this screen should defer loading (cold start phase: deferred) */
  deferLoad: boolean;
}

/**
 * All sovereignty/privacy/security routes added in Step 31.
 */
export const SOVEREIGNTY_ROUTES: SovereigntyRoute[] = [
  // Sovereignty screens
  {
    name: 'LivingWill',
    screenKey: 'LivingWill',
    deepLink: 'semblance://sovereignty/living-will',
    category: 'sovereignty',
    deferLoad: true,
  },
  {
    name: 'Witness',
    screenKey: 'Witness',
    deepLink: 'semblance://sovereignty/witness',
    category: 'sovereignty',
    deferLoad: true,
  },
  {
    name: 'Inheritance',
    screenKey: 'Inheritance',
    deepLink: 'semblance://sovereignty/inheritance',
    category: 'sovereignty',
    deferLoad: true,
  },
  {
    name: 'InheritanceActivation',
    screenKey: 'InheritanceActivation',
    deepLink: 'semblance://sovereignty/inheritance/activate',
    category: 'sovereignty',
    deferLoad: true,
  },
  {
    name: 'Network',
    screenKey: 'Network',
    deepLink: 'semblance://sovereignty/network',
    category: 'sovereignty',
    deferLoad: true,
  },

  // Adversarial screens
  {
    name: 'AdversarialDashboard',
    screenKey: 'AdversarialDashboard',
    deepLink: 'semblance://adversarial/dashboard',
    category: 'adversarial',
    deferLoad: true,
  },

  // Privacy screens
  {
    name: 'PrivacyDashboard',
    screenKey: 'PrivacyDashboard',
    deepLink: 'semblance://privacy/dashboard',
    category: 'privacy',
    deferLoad: true,
  },
  {
    name: 'ProofOfPrivacy',
    screenKey: 'ProofOfPrivacy',
    deepLink: 'semblance://privacy/proof',
    category: 'privacy',
    deferLoad: true,
  },

  // Security screens
  {
    name: 'BiometricSetup',
    screenKey: 'BiometricSetup',
    deepLink: 'semblance://security/biometric',
    category: 'security',
    deferLoad: true,
  },
  {
    name: 'Backup',
    screenKey: 'Backup',
    deepLink: 'semblance://security/backup',
    category: 'security',
    deferLoad: true,
  },
];

/**
 * Get all registered route names.
 */
export function getRouteNames(): string[] {
  return SOVEREIGNTY_ROUTES.map(r => r.name);
}

/**
 * Get routes by category.
 */
export function getRoutesByCategory(category: SovereigntyRoute['category']): SovereigntyRoute[] {
  return SOVEREIGNTY_ROUTES.filter(r => r.category === category);
}

/**
 * Resolve a deep link URI to a route.
 * Returns the matching route or null.
 */
export function resolveDeepLink(uri: string): SovereigntyRoute | null {
  return SOVEREIGNTY_ROUTES.find(r => r.deepLink === uri) ?? null;
}

/**
 * Get all deep link patterns for registration with the OS.
 */
export function getDeepLinkPatterns(): string[] {
  return SOVEREIGNTY_ROUTES
    .filter(r => r.deepLink)
    .map(r => r.deepLink!);
}

/**
 * Check if a route should be deferred during cold start.
 */
export function isDeferredRoute(routeName: string): boolean {
  const route = SOVEREIGNTY_ROUTES.find(r => r.name === routeName);
  return route?.deferLoad ?? true;
}
