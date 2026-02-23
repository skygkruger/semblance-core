// Extension Loader — Dynamically loads extensions at runtime.
// Uses dynamic import() so there is no static dependency on extension packages.
// Returns empty array when no extensions are installed.

import type { SemblanceExtension } from './types.js';

/** All loaded extensions, populated by loadExtensions() */
let loadedExtensions: SemblanceExtension[] = [];

/**
 * Attempt to load known extension packages via dynamic import.
 * Returns the loaded extensions. Safe to call multiple times — idempotent after first load.
 */
export async function loadExtensions(): Promise<SemblanceExtension[]> {
  if (loadedExtensions.length > 0) {
    return loadedExtensions;
  }

  const extensions: SemblanceExtension[] = [];

  // Digital Representative extension
  // Dynamic import with string variable prevents TypeScript from resolving the module statically.
  // When @semblance/dr is not installed, the import fails and we gracefully return [].
  const drPackage = '@semblance/dr';
  try {
    const drModule: Record<string, unknown> = await import(/* webpackIgnore: true */ drPackage);
    if (drModule && typeof drModule['createExtension'] === 'function') {
      const ext = (drModule['createExtension'] as () => SemblanceExtension)();
      extensions.push(ext);
    }
  } catch {
    // @semblance/dr not installed — graceful degradation
  }

  loadedExtensions = extensions;
  return extensions;
}

/**
 * Get already-loaded extensions synchronously.
 * Returns empty array if loadExtensions() hasn't been called yet.
 */
export function getLoadedExtensions(): SemblanceExtension[] {
  return loadedExtensions;
}

/**
 * Register an extension manually (for testing or programmatic registration).
 */
export function registerExtension(ext: SemblanceExtension): void {
  loadedExtensions.push(ext);
}

/**
 * Clear all loaded extensions (for testing).
 */
export function clearExtensions(): void {
  loadedExtensions = [];
}
