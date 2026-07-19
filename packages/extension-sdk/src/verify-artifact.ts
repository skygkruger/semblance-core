import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DrPublisherKeysFile,
  SignedExtensionManifest,
  UnsignedExtensionManifest,
  type DrPublisherKeyRecord,
} from './manifest.js';
import { base64urlDecode, canonicalSigningPayload } from './canonicalize.js';

export interface VerifyExtensionArtifactOptions {
  manifest: unknown;
  artifactBytes: Buffer;
  coreVersion: string;
  nowMs?: number;
  publisherKeys?: DrPublisherKeyRecord[];
}

export interface VerifyExtensionArtifactResult {
  valid: boolean;
  error?: string;
  manifest?: SignedExtensionManifest;
}

const packageRoot = dirname(fileURLToPath(import.meta.url));
const defaultPublisherKeysPath = join(
  packageRoot,
  '..',
  '..',
  '..',
  'release',
  'keys',
  'dr-publisher-keys.json',
);

function parseSemver(version: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareSemver(a: string, b: string): number {
  const left = parseSemver(a);
  const right = parseSemver(b);
  if (!left || !right) {
    throw new Error(`Invalid semver: '${a}' or '${b}'`);
  }
  for (let i = 0; i < 3; i += 1) {
    const leftPart = left[i] ?? 0;
    const rightPart = right[i] ?? 0;
    if (leftPart !== rightPart) {
      return leftPart - rightPart;
    }
  }
  return 0;
}

export function isCoreVersionCompatible(coreVersion: string, minCoreVersion: string): boolean {
  return compareSemver(coreVersion, minCoreVersion) >= 0;
}

export function sha256Prefixed(buffer: Buffer): string {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

export function loadDrPublisherKeys(path = defaultPublisherKeysPath): DrPublisherKeyRecord[] {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  return DrPublisherKeysFile.parse(raw).keys;
}

export function findPublisherKey(
  keyId: string,
  publisherKeys: DrPublisherKeyRecord[],
): DrPublisherKeyRecord | undefined {
  return publisherKeys.find((key) => key.keyId === keyId);
}

export function verifyManifestSignature(
  manifest: SignedExtensionManifest,
  publicKeyPem: string,
): VerifyExtensionArtifactResult {
  try {
    const publicKey = createPublicKey(publicKeyPem);
    const payload = Buffer.from(canonicalSigningPayload(manifest), 'utf8');
    const signature = base64urlDecode(manifest.signature);
    const ok = verify(null, payload, publicKey, signature);
    return ok
      ? { valid: true, manifest }
      : { valid: false, error: 'Signature verification failed' };
  } catch {
    return { valid: false, error: 'Signature verification failed' };
  }
}

export function verifySignedExtensionArtifact(
  options: VerifyExtensionArtifactOptions,
): VerifyExtensionArtifactResult {
  const nowMs = options.nowMs ?? Date.now();
  const publisherKeys = options.publisherKeys ?? loadDrPublisherKeys();

  const raw = options.manifest as Record<string, unknown>;
  const unsignedCandidate = { ...raw };
  delete unsignedCandidate.signature;
  delete unsignedCandidate.signatureKeyId;

  const unsigned = UnsignedExtensionManifest.safeParse(unsignedCandidate);
  if (!unsigned.success) {
    return {
      valid: false,
      error: unsigned.error.message,
    };
  }

  if (typeof raw.signature !== 'string' || raw.signature.length === 0) {
    return { valid: false, error: 'Manifest is unsigned' };
  }
  if (typeof raw.signatureKeyId !== 'string' || raw.signatureKeyId.length === 0) {
    return { valid: false, error: 'Manifest is unsigned' };
  }

  let manifest: SignedExtensionManifest;
  try {
    manifest = SignedExtensionManifest.parse(options.manifest);
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid signed manifest shape',
    };
  }

  const publisherKey = findPublisherKey(manifest.signatureKeyId, publisherKeys);
  if (!publisherKey) {
    return { valid: false, error: `Unknown signatureKeyId: ${manifest.signatureKeyId}` };
  }

  const signature = verifyManifestSignature(manifest, publisherKey.publicKeyPem);
  if (!signature.valid) {
    return signature;
  }

  const actualHash = sha256Prefixed(options.artifactBytes);
  if (actualHash !== manifest.artifactHash) {
    return {
      valid: false,
      error: `Artifact hash mismatch: expected ${manifest.artifactHash}, got ${actualHash}`,
    };
  }

  if (manifest.expiresAt) {
    const expiresMs = Date.parse(manifest.expiresAt);
    if (!Number.isFinite(expiresMs)) {
      return { valid: false, error: `Invalid expiresAt: ${manifest.expiresAt}` };
    }
    if (expiresMs <= nowMs) {
      return { valid: false, error: `Manifest expired at ${manifest.expiresAt}` };
    }
  }

  if (!isCoreVersionCompatible(options.coreVersion, manifest.minCoreVersion)) {
    return {
      valid: false,
      error: `Core version ${options.coreVersion} is below required ${manifest.minCoreVersion}`,
    };
  }

  return { valid: true, manifest };
}
