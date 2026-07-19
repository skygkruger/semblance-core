import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  loadDrPublisherKeys,
  verifySignedExtensionArtifact,
  EXTENSION_API_V1,
  type DrPublisherKeyRecord,
  type KernelEntitlementSnapshot,
} from '@semblance/extension-sdk';
import type { ExtensionInitContextLike } from './client-adapters.js';
import { buildExtensionInitContext } from './client-adapters.js';
import { extractExtensionArtifact, importExtractedExtension } from './extract-artifact.js';
import { createExtensionSandbox } from './sandbox.js';
import type { ExtensionRunnerClients } from '@semblance/extension-sdk';

export interface SemblanceExtensionLike {
  id: string;
  name: string;
  version: string;
  tools?: unknown[];
  initialize?: (ctx: ExtensionInitContextLike) => Promise<void> | void;
}

export interface LoadSignedDigitalRepresentativeOptions {
  manifestPath: string;
  artifactPath?: string;
  publisherKeys?: DrPublisherKeyRecord[];
  entitlementSnapshot?: KernelEntitlementSnapshot | null;
  coreVersion?: string;
  clients: ExtensionRunnerClients;
  dataDir?: string;
  model?: string;
  legacyContext?: Partial<ExtensionInitContextLike>;
}

export interface LoadSignedDigitalRepresentativeResult {
  ok: boolean;
  error?: string;
  extension?: SemblanceExtensionLike;
  manifestId?: string;
  manifestVersion?: string;
  artifactValid?: boolean;
}

export interface VerifySignedArtifactPathsOptions {
  manifestPath: string;
  artifactPath?: string;
  publisherKeys?: DrPublisherKeyRecord[];
  coreVersion?: string;
}

export interface VerifySignedArtifactPathsResult {
  present: boolean;
  valid: boolean;
  error?: string;
  manifestId?: string;
}

const DEFAULT_CORE_VERSION = '1.0.0';

/** Frozen Extension API generation loaded by the signed runner. */
export const LOADED_EXTENSION_API = EXTENSION_API_V1;

export function resolveArtifactPath(manifestPath: string, artifactPath?: string): string {
  if (artifactPath) {
    return resolve(artifactPath);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    artifactRelativePath?: string;
  };
  if (!manifest.artifactRelativePath) {
    throw new Error('Manifest missing artifactRelativePath');
  }
  return join(dirname(resolve(manifestPath)), manifest.artifactRelativePath);
}

export function verifySignedArtifactPaths(
  options: VerifySignedArtifactPathsOptions,
): VerifySignedArtifactPathsResult {
  try {
    const manifestPath = resolve(options.manifestPath);
    const artifactPath = resolveArtifactPath(manifestPath, options.artifactPath);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
    const artifactBytes = readFileSync(artifactPath);
    const verification = verifySignedExtensionArtifact({
      manifest,
      artifactBytes,
      coreVersion: options.coreVersion ?? DEFAULT_CORE_VERSION,
      publisherKeys: options.publisherKeys ?? loadDrPublisherKeys(),
    });

    return {
      present: true,
      valid: verification.valid,
      error: verification.error,
      manifestId: verification.manifest?.id,
    };
  } catch (error) {
    return {
      present: false,
      valid: false,
      error: error instanceof Error ? error.message : 'Artifact verification failed',
    };
  }
}

export async function loadSignedDigitalRepresentative(
  options: LoadSignedDigitalRepresentativeOptions,
): Promise<LoadSignedDigitalRepresentativeResult> {
  const manifestPath = resolve(options.manifestPath);
  const artifactPath = resolveArtifactPath(manifestPath, options.artifactPath);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
  const artifactBytes = readFileSync(artifactPath);

  const verification = verifySignedExtensionArtifact({
    manifest,
    artifactBytes,
    coreVersion: options.coreVersion ?? DEFAULT_CORE_VERSION,
    publisherKeys: options.publisherKeys ?? loadDrPublisherKeys(),
  });

  if (!verification.valid || !verification.manifest) {
    return {
      ok: false,
      error: verification.error ?? 'Signed artifact verification failed',
      artifactValid: false,
    };
  }

  const extracted = extractExtensionArtifact(artifactBytes);
  const sandbox = createExtensionSandbox({
    allowedWritePaths: [extracted.extractDir, extracted.packageDir],
  });

  try {
    const module = await sandbox.run(async () =>
      importExtractedExtension<Record<string, unknown>>(extracted),
    );

    if (typeof module.createExtension !== 'function') {
      return {
        ok: false,
        error: 'Signed artifact does not export createExtension()',
        artifactValid: true,
      };
    }

    const extension = (module.createExtension as () => SemblanceExtensionLike)();
    const initContext = buildExtensionInitContext({
      clients: options.clients,
      dataDir: options.dataDir,
      model: options.model,
      legacy: options.legacyContext,
    });

    if (extension.initialize) {
      await sandbox.run(async () => extension.initialize!(initContext));
    }

    return {
      ok: true,
      extension,
      manifestId: verification.manifest.id,
      manifestVersion: verification.manifest.version,
      artifactValid: true,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to load signed extension',
      artifactValid: true,
    };
  } finally {
    extracted.cleanup();
  }
}
