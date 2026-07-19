import {
  loadDrPublisherKeys,
  verifySignedExtensionArtifact,
  type DrPublisherKeyRecord,
  type SignedExtensionManifest,
} from '@semblance/extension-sdk';

export type ExtensionOwnership = 'built-in' | 'user-local' | 'marketplace';

export interface ExtensionPublisherTrustEvaluation {
  readonly allowed: boolean;
  readonly quarantined: boolean;
  readonly degradedPolicy: boolean;
  readonly reason: string;
  readonly manifest?: SignedExtensionManifest;
  readonly trustLevel?: string;
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

export function createArtifactOnlyExtensionTrustChecker(
  publisherKeys?: DrPublisherKeyRecord[],
): ExtensionTrustChecker {
  return {
    checkTrust(request: ExtensionTrustCheckRequest): ExtensionPublisherTrustEvaluation {
      const verification = verifySignedExtensionArtifact({
        manifest: request.manifest,
        artifactBytes: request.artifactBytes,
        coreVersion: request.coreVersion,
        nowMs: request.nowMs,
        publisherKeys: publisherKeys ?? loadDrPublisherKeys(),
      });
      if (!verification.valid || !verification.manifest) {
        return {
          allowed: false,
          quarantined: false,
          degradedPolicy: false,
          reason: verification.error ?? 'Signed artifact verification failed',
        };
      }
      return {
        allowed: true,
        quarantined: false,
        degradedPolicy: false,
        reason: 'artifact_verified',
        manifest: verification.manifest,
        trustLevel: 'built-in',
      };
    },
  };
}
