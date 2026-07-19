// Extension Loader — Dynamically loads extensions at runtime.
// Uses dynamic import() so there is no static dependency on extension packages.
// Returns empty array when no extensions are installed.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  loadSignedDigitalRepresentative,
  verifySignedArtifactPaths,
  type ExtensionRunnerClients,
} from '@semblance/extension-runner';
import type { DrPublisherKeyRecord, KernelEntitlementSnapshot } from '@semblance/extension-sdk';
import type { SemblanceExtension } from './types.js';

/** All loaded extensions, populated by loadExtensions() */
let loadedExtensions: SemblanceExtension[] = [];

export interface SignedDrPaths {
  manifestPath: string;
  artifactPath?: string;
}

export interface LoadExtensionsOptions {
  coreVersion?: string;
  signedPaths?: SignedDrPaths | null;
  publisherKeys?: DrPublisherKeyRecord[];
  entitlementSnapshot?: KernelEntitlementSnapshot | null;
  runnerClients?: ExtensionRunnerClients;
  dataDir?: string;
  model?: string;
  /** Legacy in-process context handles for dev fallback only. */
  legacyContext?: Record<string, unknown>;
}

export interface DigitalRepresentativeArtifactStatus {
  configured: boolean;
  present: boolean;
  valid: boolean;
  loadedViaRunner: boolean;
  error?: string;
  manifestId?: string;
}

let artifactStatus: DigitalRepresentativeArtifactStatus = {
  configured: false,
  present: false,
  valid: false,
  loadedViaRunner: false,
};

const DEFAULT_CORE_VERSION = '1.0.0';

function resetArtifactStatus(): void {
  artifactStatus = {
    configured: false,
    present: false,
    valid: false,
    loadedViaRunner: false,
  };
}

export function getDigitalRepresentativeArtifactStatus(): DigitalRepresentativeArtifactStatus {
  return { ...artifactStatus };
}

function resolveSignedDrPaths(options?: LoadExtensionsOptions): SignedDrPaths | null {
  if (options?.signedPaths === null) {
    return null;
  }
  if (options?.signedPaths?.manifestPath) {
    return options.signedPaths;
  }

  const manifestEnv = process.env.SEMBLANCE_DR_MANIFEST;
  const artifactEnv = process.env.SEMBLANCE_DR_ARTIFACT;

  if (manifestEnv) {
    return {
      manifestPath: resolve(manifestEnv),
      artifactPath: artifactEnv ? resolve(artifactEnv) : undefined,
    };
  }

  if (artifactEnv) {
    const artifactPath = resolve(artifactEnv);
    const manifestCandidate = join(dirname(artifactPath), 'extension.manifest.json');
    try {
      readFileSync(manifestCandidate, 'utf8');
      return { manifestPath: manifestCandidate, artifactPath };
    } catch {
      return null;
    }
  }

  return null;
}

function probeSignedArtifact(
  signedPaths: SignedDrPaths,
  options?: LoadExtensionsOptions,
): DigitalRepresentativeArtifactStatus {
  const verification = verifySignedArtifactPaths({
    manifestPath: signedPaths.manifestPath,
    artifactPath: signedPaths.artifactPath,
    publisherKeys: options?.publisherKeys,
    coreVersion: options?.coreVersion ?? DEFAULT_CORE_VERSION,
  });

  return {
    configured: true,
    present: verification.present,
    valid: verification.valid,
    loadedViaRunner: false,
    error: verification.error,
    manifestId: verification.manifestId,
  };
}

/**
 * Attempt to load known extension packages.
 * Prefers signed runner path when configured; falls back to dynamic import for dev/free.
 */
export async function loadExtensions(options?: LoadExtensionsOptions): Promise<SemblanceExtension[]> {
  if (loadedExtensions.length > 0) {
    return loadedExtensions;
  }

  resetArtifactStatus();
  const extensions: SemblanceExtension[] = [];
  const signedPaths = resolveSignedDrPaths(options);

  if (signedPaths) {
    artifactStatus = probeSignedArtifact(signedPaths, options);

    if (artifactStatus.valid && options?.runnerClients) {
      const result = await loadSignedDigitalRepresentative({
        manifestPath: signedPaths.manifestPath,
        artifactPath: signedPaths.artifactPath,
        publisherKeys: options.publisherKeys,
        entitlementSnapshot: options.entitlementSnapshot ?? null,
        coreVersion: options?.coreVersion ?? DEFAULT_CORE_VERSION,
        clients: options.runnerClients,
        dataDir: options.dataDir,
        model: options.model,
        legacyContext: options.legacyContext,
      });

      if (result.ok && result.extension) {
        extensions.push(result.extension as SemblanceExtension);
        artifactStatus = {
          ...artifactStatus,
          loadedViaRunner: true,
          valid: true,
          present: true,
        };
      } else {
        artifactStatus = {
          ...artifactStatus,
          valid: false,
          error: result.error ?? artifactStatus.error,
        };
      }

      loadedExtensions = extensions;
      return extensions;
    }

    loadedExtensions = extensions;
    return extensions;
  }

  // Dev/free fallback — dynamic import does NOT grant paid readiness.
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
  resetArtifactStatus();
}
