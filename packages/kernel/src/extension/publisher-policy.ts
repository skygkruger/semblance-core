import {
  verifySignedExtensionArtifact,
  type DrPublisherKeyRecord,
  type SignedExtensionManifest,
} from '@semblance/extension-sdk';
import type { ExtensionPublisherTrustLevel, ExtensionPublisherTrustStore } from './trust-store.js';
import type { ExtensionOwnership, ExtensionRevocationStore } from './revocation.js';

export const EXTENSION_API_RANGE_V1 = '1' as const;
export const EXTENSION_PLATFORM_API_V1 = '2026-07-18' as const;

export const DEFAULT_TRUST_API_RANGES: Record<
  ExtensionPublisherTrustLevel,
  readonly string[]
> = {
  'built-in': [EXTENSION_API_RANGE_V1, EXTENSION_PLATFORM_API_V1, '*'],
  'organization-trusted': [EXTENSION_API_RANGE_V1, EXTENSION_PLATFORM_API_V1],
  'user-trusted': [EXTENSION_API_RANGE_V1],
};

export interface ExtensionPublisherTrustEvaluation {
  readonly allowed: boolean;
  readonly quarantined: boolean;
  readonly degradedPolicy: boolean;
  readonly reason: string;
  readonly manifest?: SignedExtensionManifest;
  readonly trustLevel?: ExtensionPublisherTrustLevel;
}

export interface ExtensionTrustCheckRequest {
  readonly manifest: unknown;
  readonly artifactBytes: Buffer;
  readonly coreVersion: string;
  readonly nowMs?: number;
  readonly ownership?: ExtensionOwnership;
}

export interface ExtensionTrustChecker {
  checkTrust(request: ExtensionTrustCheckRequest): ExtensionPublisherTrustEvaluation;
}

export interface EvaluateExtensionPublisherTrustInput {
  readonly manifest: unknown;
  readonly artifactBytes: Buffer;
  readonly coreVersion: string;
  readonly nowMs?: number;
  readonly ownership?: ExtensionOwnership;
  readonly publisherKeys?: DrPublisherKeyRecord[];
}

export function extractManifestApiRanges(manifest: Record<string, unknown>): string[] {
  const ranges = new Set<string>();
  if (typeof manifest.protocolVersion === 'number') {
    ranges.add(String(manifest.protocolVersion));
  }
  if (typeof manifest.platformApi === 'string' && manifest.platformApi.length > 0) {
    ranges.add(manifest.platformApi);
  }
  const runtimeRequirements = manifest.runtimeRequirements;
  if (runtimeRequirements && typeof runtimeRequirements === 'object' && !Array.isArray(runtimeRequirements)) {
    const platformApi = (runtimeRequirements as Record<string, unknown>).platformApi;
    if (typeof platformApi === 'string' && platformApi.length > 0) {
      ranges.add(platformApi);
    }
  }
  if (ranges.size === 0) {
    ranges.add(EXTENSION_API_RANGE_V1);
  }
  return [...ranges];
}

export function isApiRangeAllowedForTrustLevel(
  trustLevel: ExtensionPublisherTrustLevel,
  apiRanges: readonly string[],
  policy: Record<ExtensionPublisherTrustLevel, readonly string[]> = DEFAULT_TRUST_API_RANGES,
): boolean {
  const allowed = policy[trustLevel];
  if (allowed.includes('*')) {
    return true;
  }
  return apiRanges.every((range) => allowed.includes(range));
}

export function evaluateExtensionPublisherTrust(
  trustStore: ExtensionPublisherTrustStore,
  revocationStore: ExtensionRevocationStore,
  input: EvaluateExtensionPublisherTrustInput,
): ExtensionPublisherTrustEvaluation {
  const ownership = input.ownership ?? 'marketplace';
  const publisherKeys = input.publisherKeys ?? trustStore.getPublisherKeys();

  const verification = verifySignedExtensionArtifact({
    manifest: input.manifest,
    artifactBytes: input.artifactBytes,
    coreVersion: input.coreVersion,
    nowMs: input.nowMs,
    publisherKeys,
  });

  if (!verification.valid || !verification.manifest) {
    return {
      allowed: false,
      quarantined: false,
      degradedPolicy: false,
      reason: verification.error ?? 'Signed artifact verification failed',
    };
  }

  const manifest = verification.manifest;
  const publisher = trustStore.getPublisherByKeyId(manifest.signatureKeyId);
  if (!publisher) {
    return {
      allowed: false,
      quarantined: false,
      degradedPolicy: false,
      reason: `Unknown publisher key: ${manifest.signatureKeyId}`,
      manifest,
    };
  }

  const apiRanges = extractManifestApiRanges(manifest as unknown as Record<string, unknown>);
  if (!isApiRangeAllowedForTrustLevel(publisher.trustLevel, apiRanges)) {
    return {
      allowed: false,
      quarantined: false,
      degradedPolicy: false,
      reason: `Publisher trust level '${publisher.trustLevel}' cannot load API range(s): ${apiRanges.join(', ')}`,
      manifest,
      trustLevel: publisher.trustLevel,
    };
  }

  const revocation = revocationStore.evaluateLoadPolicy({
    publisherKeyId: manifest.signatureKeyId,
    manifestId: manifest.id,
    artifactHash: manifest.artifactHash,
    ownership,
  });

  if (revocation.action === 'quarantine') {
    return {
      allowed: false,
      quarantined: true,
      degradedPolicy: false,
      reason: revocation.reason,
      manifest,
      trustLevel: publisher.trustLevel,
    };
  }

  if (revocation.action === 'degraded') {
    return {
      allowed: true,
      quarantined: false,
      degradedPolicy: true,
      reason: revocation.reason,
      manifest,
      trustLevel: publisher.trustLevel,
    };
  }

  return {
    allowed: true,
    quarantined: false,
    degradedPolicy: false,
    reason: 'trusted',
    manifest,
    trustLevel: publisher.trustLevel,
  };
}

export function createKernelExtensionTrustChecker(
  trustStore: ExtensionPublisherTrustStore,
  revocationStore: ExtensionRevocationStore,
): ExtensionTrustChecker {
  return {
    checkTrust(request: ExtensionTrustCheckRequest): ExtensionPublisherTrustEvaluation {
      return evaluateExtensionPublisherTrust(trustStore, revocationStore, request);
    },
  };
}
