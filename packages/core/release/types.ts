import { canonicalJSON } from '../audit/merkle-chain.js';
import { verify as verifyEd25519 } from '../crypto/ed25519.js';
import { getPlatform } from '../platform/index.js';

export type EvidenceState =
  | 'Specified'
  | 'Implemented'
  | 'Wired'
  | 'DataVerified'
  | 'RuntimeVerified'
  | 'AdversariallyVerified'
  | 'Released'
  | 'FieldProven';

export type ReleaseRepository = 'core' | 'representative' | 'website';

export interface RepresentativeReleasePins {
  packageVersion: string;
  artifactHash: string;
  extensionManifestHash: string;
}

export interface FeatureEvidenceV1 {
  id: string;
  name: string;
  repository: ReleaseRepository;
  state: EvidenceState;
  usesDigitalRepresentative: boolean;
  signedArtifactNames: string[];
  evidenceIds: string[];
  protocolVersions: Record<string, number>;
  modelRuntimeHashes: string[];
  confidentialWorkloadMeasurements: string[];
  infrastructurePolicyVersions: string[];
  legalNoticesVersion: string;
  representativePins: RepresentativeReleasePins | null;
}

export interface ReleaseManifestV1 {
  schemaVersion: 1;
  releaseId: string;
  generatedAt: string;
  repositories: {
    core: { sourceCommit: string; sourceTreeHash: string };
    representative: {
      sourceCommit: string;
      sourceTreeHash: string;
      packageVersion: string;
      artifactHash: string | null;
      extensionManifestHash: string | null;
    };
    website: { sourceCommit: string; sourceTreeHash: string };
  };
  signedArtifacts: Array<{
    name: string;
    path: string;
    sha256: string;
    signature: string;
    signatureKeyId: string;
  }>;
  evidence: Array<{
    id: string;
    repository: ReleaseRepository;
    path: string;
    sha256: string;
    requiredForStates: EvidenceState[];
  }>;
  commerce: { newSalesEnabled: boolean; freezeEvidence: string[] };
  protocolVersions: Record<string, number>;
  modelRuntimeHashes: string[];
  confidentialWorkloadMeasurements: string[];
  infrastructurePolicyVersions: string[];
  legalNoticesVersion: string;
  completedSlices: number[];
  features: FeatureEvidenceV1[];
  signatureKeyId: string;
  signature: string;
}

export interface TrustedReleaseKeyV1 {
  id: string;
  algorithm: 'Ed25519';
  publicKey: string;
  validFrom: string;
  validUntil: string;
}

export interface TrustedReleaseKeysV1 {
  schemaVersion: 1;
  keys: TrustedReleaseKeyV1[];
}

export interface ReleaseValidationResult {
  valid: boolean;
  errors: string[];
}

export interface SourceProvenanceVerifier {
  headCommit: string;
  isAncestor(sourceCommit: string, headCommit: string): boolean;
  treeHash(sourceCommit: string): string | null;
}

export interface VerifyReleaseManifestOptions {
  trustedKeys: TrustedReleaseKeysV1;
  now?: Date;
  artifactRoot?: string;
  evidenceRoots?: Partial<Record<ReleaseRepository, string>>;
  hashFile?: (absolutePath: string) => string;
  sourceProvenance?: Partial<Record<ReleaseRepository, SourceProvenanceVerifier>>;
}

const STATES: readonly EvidenceState[] = [
  'Specified',
  'Implemented',
  'Wired',
  'DataVerified',
  'RuntimeVerified',
  'AdversariallyVerified',
  'Released',
  'FieldProven',
];
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const COMMIT_PATTERN = /^[a-f0-9]{40,64}$/;
const GIT_OBJECT_PATTERN = /^[a-f0-9]{40,64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isVersionMap(value: unknown): value is Record<string, number> {
  return isRecord(value)
    && Object.values(value).every(
      (version) => typeof version === 'number' && Number.isInteger(version) && version >= 0,
    );
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function sameVersionMap(
  left: Record<string, number>,
  right: Record<string, number>,
): boolean {
  return canonicalJSON(left) === canonicalJSON(right);
}

function validateRepository(
  value: unknown,
  label: string,
  errors: string[],
): void {
  if (!isRecord(value)) {
    errors.push(`${label} must be an object`);
    return;
  }
  if (!isNonemptyString(value.sourceCommit) || !COMMIT_PATTERN.test(value.sourceCommit)) {
    errors.push(`${label}.sourceCommit must be a 40-64 character lowercase hex commit`);
  }
  if (!isNonemptyString(value.sourceTreeHash) || !GIT_OBJECT_PATTERN.test(value.sourceTreeHash)) {
    errors.push(`${label}.sourceTreeHash must be a 40-64 character lowercase hex Git object ID`);
  }
}

function validateFeature(
  feature: FeatureEvidenceV1,
  manifest: ReleaseManifestV1,
  errors: string[],
): void {
  const label = `Feature ${feature.id || '<missing id>'}`;
  if (!isNonemptyString(feature.id)) errors.push('Feature id must be nonempty');
  if (!isNonemptyString(feature.name)) errors.push(`${label} name must be nonempty`);
  if (!['core', 'representative', 'website'].includes(feature.repository)) {
    errors.push(`${label} has an invalid repository`);
  }
  if (!STATES.includes(feature.state)) errors.push(`${label} has an invalid state`);

  if (feature.state !== 'Released' && feature.state !== 'FieldProven') return;

  if (feature.signedArtifactNames.length === 0) {
    errors.push(`${label} in ${feature.state} state requires at least one signed artifact`);
  }
  if (feature.evidenceIds.length === 0) {
    errors.push(`${label} in ${feature.state} state requires nonempty evidence references`);
  }
  for (const name of feature.signedArtifactNames) {
    if (!manifest.signedArtifacts.some((artifact) => artifact.name === name)) {
      errors.push(`${label} references missing signed artifact ${name}`);
    }
  }
  for (const id of feature.evidenceIds) {
    const evidence = manifest.evidence.find((item) => item.id === id);
    if (!evidence) {
      errors.push(`${label} references missing evidence ${id}`);
    } else if (!evidence.requiredForStates.includes(feature.state)) {
      errors.push(`${label} evidence ${id} is not declared for ${feature.state}`);
    }
  }
  if (!sameVersionMap(feature.protocolVersions, manifest.protocolVersions)) {
    errors.push(`${label} protocol versions do not match the manifest`);
  }
  if (!sameStringSet(feature.modelRuntimeHashes, manifest.modelRuntimeHashes)) {
    errors.push(`${label} model runtime hashes do not match the manifest`);
  }
  if (!sameStringSet(
    feature.confidentialWorkloadMeasurements,
    manifest.confidentialWorkloadMeasurements,
  )) {
    errors.push(`${label} confidential workload measurements do not match the manifest`);
  }
  if (!sameStringSet(
    feature.infrastructurePolicyVersions,
    manifest.infrastructurePolicyVersions,
  )) {
    errors.push(`${label} infrastructure policy versions do not match the manifest`);
  }
  if (feature.legalNoticesVersion !== manifest.legalNoticesVersion) {
    errors.push(`${label} legal notices version does not match the manifest`);
  }

  if (feature.usesDigitalRepresentative) {
    const pins = feature.representativePins;
    const representative = manifest.repositories.representative;
    if (
      pins === null
      || representative.artifactHash === null
      || representative.extensionManifestHash === null
      || pins.packageVersion !== representative.packageVersion
      || pins.artifactHash !== representative.artifactHash
      || pins.extensionManifestHash !== representative.extensionManifestHash
    ) {
      errors.push(`${label} has missing or mismatched DR package/extension manifest pins`);
    }
  } else if (feature.representativePins !== null) {
    errors.push(`${label} must not declare DR pins when usesDigitalRepresentative is false`);
  }
}

/**
 * Validate both the v1 data shape and cross-field release policy invariants.
 */
export function validateReleaseManifest(value: unknown): ReleaseValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['Manifest must be an object'] };

  if (value.schemaVersion !== 1) errors.push('schemaVersion must equal 1');
  if (!isNonemptyString(value.releaseId)) errors.push('releaseId must be nonempty');
  if (!isNonemptyString(value.generatedAt) || !Number.isFinite(Date.parse(value.generatedAt))) {
    errors.push('generatedAt must be an ISO-8601 timestamp');
  }
  if (!isRecord(value.repositories)) {
    errors.push('repositories must be an object');
  } else {
    validateRepository(value.repositories.core, 'repositories.core', errors);
    validateRepository(value.repositories.representative, 'repositories.representative', errors);
    validateRepository(value.repositories.website, 'repositories.website', errors);
    const representative = value.repositories.representative;
    if (isRecord(representative)) {
      if (!isNonemptyString(representative.packageVersion)) {
        errors.push('repositories.representative.packageVersion must be nonempty');
      }
      for (const field of ['artifactHash', 'extensionManifestHash'] as const) {
        const hash = representative[field];
        if (hash !== null && (typeof hash !== 'string' || !SHA256_PATTERN.test(hash))) {
          errors.push(`repositories.representative.${field} must be null or a SHA-256 hash`);
        }
      }
    }
  }

  const arrayFields = [
    'signedArtifacts',
    'evidence',
    'modelRuntimeHashes',
    'confidentialWorkloadMeasurements',
    'infrastructurePolicyVersions',
    'completedSlices',
    'features',
  ] as const;
  for (const field of arrayFields) {
    if (!Array.isArray(value[field])) errors.push(`${field} must be an array`);
  }
  if (!isRecord(value.commerce)) errors.push('commerce must be an object');
  else {
    if (typeof value.commerce.newSalesEnabled !== 'boolean') {
      errors.push('commerce.newSalesEnabled must be a boolean');
    }
    if (!isStringArray(value.commerce.freezeEvidence)) {
      errors.push('commerce.freezeEvidence must be a string array');
    }
  }
  if (!isVersionMap(value.protocolVersions)) {
    errors.push('protocolVersions must map names to nonnegative integer versions');
  }
  if (!isNonemptyString(value.legalNoticesVersion)) {
    errors.push('legalNoticesVersion must be nonempty');
  }
  if (typeof value.signatureKeyId !== 'string') errors.push('signatureKeyId must be a string');
  if (typeof value.signature !== 'string') errors.push('signature must be a string');

  if (Array.isArray(value.signedArtifacts)) {
    for (const artifact of value.signedArtifacts) {
      if (
        !isRecord(artifact)
        || !isNonemptyString(artifact.name)
        || !isNonemptyString(artifact.path)
        || typeof artifact.sha256 !== 'string'
        || typeof artifact.signature !== 'string'
        || typeof artifact.signatureKeyId !== 'string'
      ) {
        errors.push('Each signed artifact must have name, path, hash, signature, and key ID strings');
      }
    }
  }
  if (Array.isArray(value.evidence)) {
    for (const evidence of value.evidence) {
      if (
        !isRecord(evidence)
        || !isNonemptyString(evidence.id)
        || !['core', 'representative', 'website'].includes(String(evidence.repository))
        || !isNonemptyString(evidence.path)
        || typeof evidence.sha256 !== 'string'
        || !Array.isArray(evidence.requiredForStates)
      ) {
        errors.push('Each evidence entry must have a valid id, repository, path, hash, and states');
      }
    }
  }
  if (Array.isArray(value.features)) {
    for (const feature of value.features) {
      if (
        !isRecord(feature)
        || !isNonemptyString(feature.id)
        || !isNonemptyString(feature.name)
        || !['core', 'representative', 'website'].includes(String(feature.repository))
        || !STATES.includes(feature.state as EvidenceState)
        || typeof feature.usesDigitalRepresentative !== 'boolean'
        || !isStringArray(feature.signedArtifactNames)
        || !isStringArray(feature.evidenceIds)
        || !isVersionMap(feature.protocolVersions)
        || !isStringArray(feature.modelRuntimeHashes)
        || !isStringArray(feature.confidentialWorkloadMeasurements)
        || !isStringArray(feature.infrastructurePolicyVersions)
        || !isNonemptyString(feature.legalNoticesVersion)
        || (feature.representativePins !== null && !isRecord(feature.representativePins))
      ) {
        errors.push('Each feature must conform to FeatureEvidenceV1');
      }
    }
  }
  for (const field of [
    'modelRuntimeHashes',
    'confidentialWorkloadMeasurements',
    'infrastructurePolicyVersions',
  ] as const) {
    if (Array.isArray(value[field]) && !isStringArray(value[field])) {
      errors.push(`${field} must be a string array`);
    }
  }
  if (
    Array.isArray(value.completedSlices)
    && !value.completedSlices.every(
      (slice) => typeof slice === 'number' && Number.isInteger(slice) && slice >= 1,
    )
  ) {
    errors.push('completedSlices must contain positive integers');
  }

  if (errors.length > 0) return { valid: false, errors };
  const manifest = value as unknown as ReleaseManifestV1;

  if (
    manifest.commerce.newSalesEnabled
    && !manifest.completedSlices.includes(7)
  ) {
    errors.push('New sales must remain disabled until Slice 7 evidence exists');
  }
  if (
    manifest.commerce.newSalesEnabled
    && manifest.commerce.freezeEvidence.length === 0
  ) {
    errors.push('New sales require commerce freeze evidence');
  }

  const artifactNames = new Set<string>();
  for (const artifact of manifest.signedArtifacts) {
    if (!isNonemptyString(artifact.name)) errors.push('Signed artifact name must be nonempty');
    if (artifactNames.has(artifact.name)) errors.push(`Duplicate signed artifact ${artifact.name}`);
    artifactNames.add(artifact.name);
    if (!isNonemptyString(artifact.path)) errors.push(`Artifact ${artifact.name} path must be nonempty`);
    if (!SHA256_PATTERN.test(artifact.sha256)) errors.push(`Artifact ${artifact.name} has an invalid SHA-256`);
    if (!isNonemptyString(artifact.signature)) errors.push(`Artifact ${artifact.name} signature must be nonempty`);
    if (!isNonemptyString(artifact.signatureKeyId)) errors.push(`Artifact ${artifact.name} signatureKeyId must be nonempty`);
  }

  const evidenceIds = new Set<string>();
  for (const evidence of manifest.evidence) {
    if (!isNonemptyString(evidence.id)) errors.push('Evidence id must be nonempty');
    if (evidenceIds.has(evidence.id)) errors.push(`Duplicate evidence ${evidence.id}`);
    evidenceIds.add(evidence.id);
    if (!isNonemptyString(evidence.path)) errors.push(`Evidence ${evidence.id} path must be nonempty`);
    if (!SHA256_PATTERN.test(evidence.sha256)) errors.push(`Evidence ${evidence.id} has an invalid SHA-256`);
    if (evidence.requiredForStates.some((state) => !STATES.includes(state))) {
      errors.push(`Evidence ${evidence.id} has an invalid required state`);
    }
  }

  const featureIds = new Set<string>();
  for (const feature of manifest.features) {
    if (featureIds.has(feature.id)) errors.push(`Duplicate feature ${feature.id}`);
    featureIds.add(feature.id);
    validateFeature(feature, manifest, errors);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Canonical signing payload. Only the top-level signature is omitted.
 */
export function canonicalizeReleaseManifest(manifest: ReleaseManifestV1): string {
  const { signature: _signature, ...signable } = manifest;
  return canonicalJSON(signable);
}

function pathBeneath(root: string, relativePath: string): string | null {
  const { path } = getPlatform();
  const absoluteRoot = path.resolve(root);
  const absolutePath = path.resolve(absoluteRoot, relativePath);
  const rootPrefix = absoluteRoot.endsWith(path.sep)
    ? absoluteRoot
    : `${absoluteRoot}${path.sep}`;
  return absolutePath.startsWith(rootPrefix) ? absolutePath : null;
}

function validAt(key: TrustedReleaseKeyV1, now: Date): 'valid' | 'not-yet-valid' | 'expired' {
  const instant = now.getTime();
  if (instant < Date.parse(key.validFrom)) return 'not-yet-valid';
  if (instant > Date.parse(key.validUntil)) return 'expired';
  return 'valid';
}

function verifyKeySignature(
  payload: string,
  signature: string,
  key: TrustedReleaseKeyV1,
): boolean {
  try {
    return verifyEd25519(
      Buffer.from(payload, 'utf-8'),
      Buffer.from(signature, 'base64'),
      Buffer.from(key.publicKey, 'base64'),
    );
  } catch {
    return false;
  }
}

/**
 * Verify schema policy, trust window, canonical signature, provenance, and
 * on-disk hashes. File hashing is injected so binary hashing remains owned by
 * the release tooling rather than the network-isolated, platform-neutral core.
 */
export function verifyReleaseManifest(
  manifest: ReleaseManifestV1,
  options: VerifyReleaseManifestOptions,
): ReleaseValidationResult {
  const validation = validateReleaseManifest(manifest);
  const errors = [...validation.errors];
  if (!validation.valid) return validation;

  const now = options.now ?? new Date();
  const key = options.trustedKeys.keys.find((candidate) => candidate.id === manifest.signatureKeyId);
  if (!key) {
    errors.push(`Unknown release signing key: ${manifest.signatureKeyId}`);
  } else {
    const keyState = validAt(key, now);
    if (keyState === 'not-yet-valid') {
      errors.push(`Release signing key ${key.id} is not yet valid`);
    } else if (keyState === 'expired') {
      errors.push(`Release signing key ${key.id} is expired`);
    } else if (!verifyKeySignature(canonicalizeReleaseManifest(manifest), manifest.signature, key)) {
      errors.push('Release manifest signature is invalid');
    }
  }

  for (const repository of ['core', 'representative', 'website'] as const) {
    const verifier = options.sourceProvenance?.[repository];
    if (!verifier) continue;
    const source = manifest.repositories[repository];
    if (!verifier.isAncestor(source.sourceCommit, verifier.headCommit)) {
      errors.push(`${repository} sourceCommit is not an ancestor of HEAD`);
    }
    if (verifier.treeHash(source.sourceCommit) !== source.sourceTreeHash) {
      errors.push(`${repository} sourceTreeHash does not match the source commit tree`);
    }
  }

  const released = manifest.features.filter(
    (feature) => feature.state === 'Released' || feature.state === 'FieldProven',
  );
  if (released.length > 0 && !options.artifactRoot) {
    errors.push('Released features require an explicitly supplied artifact root');
  }
  if (released.length > 0 && !options.hashFile) {
    errors.push('Released features require a file hash implementation');
  }

  const requiredArtifacts = new Set(released.flatMap((feature) => feature.signedArtifactNames));
  for (const artifact of manifest.signedArtifacts) {
    if (!requiredArtifacts.has(artifact.name)) continue;
    const absolutePath = options.artifactRoot
      ? pathBeneath(options.artifactRoot, artifact.path)
      : null;
    if (!absolutePath) {
      errors.push(`Artifact ${artifact.name} path does not resolve beneath the artifact root`);
      continue;
    }
    if (options.hashFile && options.hashFile(absolutePath) !== artifact.sha256) {
      errors.push(`Artifact ${artifact.name} hash does not match`);
    }
    const artifactKey = options.trustedKeys.keys.find(
      (candidate) => candidate.id === artifact.signatureKeyId,
    );
    if (!artifactKey || validAt(artifactKey, now) !== 'valid') {
      errors.push(`Artifact ${artifact.name} uses an untrusted or inactive signing key`);
    } else if (!verifyKeySignature(artifact.sha256, artifact.signature, artifactKey)) {
      errors.push(`Artifact ${artifact.name} signature is invalid`);
    }
  }

  const requiredEvidence = new Set(released.flatMap((feature) => feature.evidenceIds));
  for (const evidence of manifest.evidence) {
    if (!requiredEvidence.has(evidence.id)) continue;
    const root = options.evidenceRoots?.[evidence.repository];
    if (!root) {
      errors.push(`Evidence ${evidence.id} has no supplied ${evidence.repository} root`);
      continue;
    }
    const absolutePath = pathBeneath(root, evidence.path);
    if (!absolutePath) {
      errors.push(`Evidence ${evidence.id} path escapes its repository root`);
    } else if (options.hashFile && options.hashFile(absolutePath) !== evidence.sha256) {
      errors.push(`Evidence ${evidence.id} hash does not match`);
    }
  }

  return { valid: errors.length === 0, errors };
}
