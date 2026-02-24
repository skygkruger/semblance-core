// Inheritance Mode Guard — Module-level singleton boolean.
// When active, blocks modifications to living-will-config, inheritance-config,
// and autonomy-settings.
// CRITICAL: No networking imports.

type ProtectedResource = 'living-will-config' | 'inheritance-config' | 'autonomy-settings';

const PROTECTED_RESOURCES: ProtectedResource[] = [
  'living-will-config',
  'inheritance-config',
  'autonomy-settings',
];

// ─── Singleton State ────────────────────────────────────────────────────────

let _inheritanceModeActive = false;

/**
 * Enable Inheritance Mode. Only called from ActivationHandler.activate().
 */
export function enableInheritanceMode(): void {
  _inheritanceModeActive = true;
}

/**
 * Disable Inheritance Mode. Only called from cancel/completion in ActivationHandler/Executor.
 */
export function disableInheritanceMode(): void {
  _inheritanceModeActive = false;
}

/**
 * Check if Inheritance Mode is currently active.
 */
export function isInheritanceModeActive(): boolean {
  return _inheritanceModeActive;
}

/**
 * Assert that Inheritance Mode is NOT active. Throws if it is.
 * Call this before any modification to protected resources.
 */
export function assertNotInInheritanceMode(operation: string): void {
  if (_inheritanceModeActive) {
    throw new Error(
      `Cannot perform "${operation}" — Inheritance Mode is active. ` +
      'Protected resources are read-only during protocol execution.',
    );
  }
}

/**
 * Assert that a specific resource can be modified.
 * Throws if Inheritance Mode is active and the resource is protected.
 */
export function assertCanModify(resource: string): void {
  if (_inheritanceModeActive && PROTECTED_RESOURCES.includes(resource as ProtectedResource)) {
    throw new Error(
      `Cannot modify "${resource}" — Inheritance Mode is active. ` +
      'Protected resources are read-only during protocol execution.',
    );
  }
}
