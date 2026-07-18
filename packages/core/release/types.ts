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
  sourceProvenance: Record<ReleaseRepository, SourceProvenanceVerifier>;
  now?: Date;
  artifactRoot?: string;
  evidenceRoots?: Partial<Record<ReleaseRepository, string>>;
  hashFile?: (absolutePath: string) => string;
  resolveRealPath?: (absolutePath: string) => string;
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
const TOP_LEVEL_KEYS = [
  'schemaVersion', 'releaseId', 'generatedAt', 'repositories', 'signedArtifacts',
  'evidence', 'commerce', 'protocolVersions', 'modelRuntimeHashes',
  'confidentialWorkloadMeasurements', 'infrastructurePolicyVersions',
  'legalNoticesVersion', 'completedSlices', 'features', 'signatureKeyId', 'signature',
] as const;
const SOURCE_KEYS = ['sourceCommit', 'sourceTreeHash'] as const;
const REPRESENTATIVE_SOURCE_KEYS = [
  ...SOURCE_KEYS, 'packageVersion', 'artifactHash', 'extensionManifestHash',
] as const;
const ARTIFACT_KEYS = ['name', 'path', 'sha256', 'signature', 'signatureKeyId'] as const;
const EVIDENCE_KEYS = ['id', 'repository', 'path', 'sha256', 'requiredForStates'] as const;
const FEATURE_KEYS = [
  'id', 'name', 'repository', 'state', 'usesDigitalRepresentative',
  'signedArtifactNames', 'evidenceIds', 'protocolVersions', 'modelRuntimeHashes',
  'confidentialWorkloadMeasurements', 'infrastructurePolicyVersions',
  'legalNoticesVersion', 'representativePins',
] as const;
const REPRESENTATIVE_PIN_KEYS = [
  'packageVersion', 'artifactHash', 'extensionManifestHash',
] as const;
const RFC3339_DATE = /^(\d\d\d\d)-(\d\d)-(\d\d)$/;
const RFC3339_TIME = /^(\d\d):(\d\d):(\d\d(?:\.\d+)?)(z|([+-])(\d\d)(?::?(\d\d))?)$/i;
const DAYS_PER_MONTH = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isUniqueNonemptyStringArray(value: unknown): value is string[] {
  return isStringArray(value)
    && value.every(isNonemptyString)
    && new Set(value).size === value.length;
}

function isVersionMap(value: unknown): value is Record<string, number> {
  return isRecord(value)
    && Object.values(value).every(
      (version) => typeof version === 'number' && Number.isInteger(version) && version >= 0,
    );
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isRfc3339Date(value: string): boolean {
  const match = RFC3339_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const maximumDay = month === 2 && isLeapYear(year) ? 29 : DAYS_PER_MONTH[month];
  return month >= 1
    && month <= 12
    && day >= 1
    && maximumDay !== undefined
    && day <= maximumDay;
}

function isRfc3339Time(value: string): boolean {
  const match = RFC3339_TIME.exec(value);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3]);
  const timezoneSign = match[5] === '-' ? -1 : 1;
  const timezoneHour = Number(match[6] ?? 0);
  const timezoneMinute = Number(match[7] ?? 0);
  if (timezoneHour > 23 || timezoneMinute > 59) return false;
  if (hour <= 23 && minute <= 59 && second < 60) return true;

  // RFC 3339 permits a leap second only at the end of a UTC day.
  const utcMinute = minute - timezoneMinute * timezoneSign;
  const utcHour = hour - timezoneHour * timezoneSign - (utcMinute < 0 ? 1 : 0);
  return (utcHour === 23 || utcHour === -1)
    && (utcMinute === 59 || utcMinute === -1)
    && second < 61;
}

function isRfc3339DateTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parts = value.split(/t|\s/i);
  return parts.length === 2
    && parts[0] !== undefined
    && parts[1] !== undefined
    && isRfc3339Date(parts[0])
    && isRfc3339Time(parts[1]);
}

function parseRfc3339DateTime(value: string): number {
  const [datePart, timePart] = value.split(/t|\s/i);
  const dateMatch = datePart ? RFC3339_DATE.exec(datePart) : null;
  const timeMatch = timePart ? RFC3339_TIME.exec(timePart) : null;
  if (!dateMatch || !timeMatch) return Number.NaN;

  const second = Number(timeMatch[3]);
  const wholeSecond = Math.min(Math.floor(second), 59);
  const milliseconds = Math.floor((second - Math.floor(second)) * 1_000);
  const date = new Date(0);
  date.setUTCFullYear(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]));
  date.setUTCHours(Number(timeMatch[1]), Number(timeMatch[2]), wholeSecond, milliseconds);

  const timezoneDirection = timeMatch[5] === '-' ? -1 : 1;
  const timezoneOffset = (
    Number(timeMatch[6] ?? 0) * 60
    + Number(timeMatch[7] ?? 0)
  ) * 60_000 * timezoneDirection;
  const leapSecond = second >= 60 ? 1_000 : 0;
  return date.getTime() + leapSecond - timezoneOffset;
}

function rejectUnknownProperties(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
  errors: string[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) errors.push(`${label} has unknown property ${key}`);
  }
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
  rejectUnknownProperties(
    value,
    label === 'repositories.representative' ? REPRESENTATIVE_SOURCE_KEYS : SOURCE_KEYS,
    label,
    errors,
  );
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
    } else {
      const packageArtifact = manifest.signedArtifacts.find(
        (artifact) => feature.signedArtifactNames.includes(artifact.name)
          && artifact.sha256 === pins.artifactHash,
      );
      if (!packageArtifact) {
        errors.push(`${label} DR artifact pin is not bound to a referenced signed artifact`);
      }
      const extensionArtifact = manifest.signedArtifacts.some(
        (artifact) => feature.signedArtifactNames.includes(artifact.name)
          && artifact.sha256 === pins.extensionManifestHash,
      );
      const extensionEvidence = manifest.evidence.some(
        (evidence) => feature.evidenceIds.includes(evidence.id)
          && evidence.repository === 'representative'
          && evidence.sha256 === pins.extensionManifestHash,
      );
      if (!extensionArtifact && !extensionEvidence) {
        errors.push(`${label} extension manifest pin is not bound to referenced artifact/evidence`);
      }
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
  rejectUnknownProperties(value, TOP_LEVEL_KEYS, 'Manifest', errors);

  if (value.schemaVersion !== 1) errors.push('schemaVersion must equal 1');
  if (!isNonemptyString(value.releaseId)) errors.push('releaseId must be nonempty');
  if (!isRfc3339DateTime(value.generatedAt)) {
    errors.push('generatedAt must be an RFC 3339 date-time');
  }
  if (!isRecord(value.repositories)) {
    errors.push('repositories must be an object');
  } else {
    rejectUnknownProperties(value.repositories, ['core', 'representative', 'website'], 'repositories', errors);
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
    rejectUnknownProperties(
      value.commerce,
      ['newSalesEnabled', 'freezeEvidence'],
      'commerce',
      errors,
    );
    if (typeof value.commerce.newSalesEnabled !== 'boolean') {
      errors.push('commerce.newSalesEnabled must be a boolean');
    }
    if (!isUniqueNonemptyStringArray(value.commerce.freezeEvidence)) {
      errors.push('commerce.freezeEvidence must be a unique array of nonempty strings');
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
      if (isRecord(artifact)) {
        rejectUnknownProperties(artifact, ARTIFACT_KEYS, 'signed artifact', errors);
      }
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
      if (isRecord(evidence)) {
        rejectUnknownProperties(evidence, EVIDENCE_KEYS, 'evidence', errors);
      }
      if (
        !isRecord(evidence)
        || !isNonemptyString(evidence.id)
        || !['core', 'representative', 'website'].includes(String(evidence.repository))
        || !isNonemptyString(evidence.path)
        || typeof evidence.sha256 !== 'string'
        || !Array.isArray(evidence.requiredForStates)
        || evidence.requiredForStates.length === 0
        || evidence.requiredForStates.some((state) => !STATES.includes(state as EvidenceState))
        || new Set(evidence.requiredForStates).size !== evidence.requiredForStates.length
      ) {
        errors.push('Each evidence entry must have a valid id, repository, path, hash, and states');
      }
    }
  }
  if (Array.isArray(value.features)) {
    for (const feature of value.features) {
      if (isRecord(feature)) {
        rejectUnknownProperties(feature, FEATURE_KEYS, 'feature', errors);
        if (isRecord(feature.representativePins)) {
          rejectUnknownProperties(
            feature.representativePins,
            REPRESENTATIVE_PIN_KEYS,
            'representativePins',
            errors,
          );
        }
      }
      if (
        !isRecord(feature)
        || !isNonemptyString(feature.id)
        || !isNonemptyString(feature.name)
        || !['core', 'representative', 'website'].includes(String(feature.repository))
        || !STATES.includes(feature.state as EvidenceState)
        || typeof feature.usesDigitalRepresentative !== 'boolean'
        || !isUniqueNonemptyStringArray(feature.signedArtifactNames)
        || !isUniqueNonemptyStringArray(feature.evidenceIds)
        || !isVersionMap(feature.protocolVersions)
        || !isUniqueNonemptyStringArray(feature.modelRuntimeHashes)
        || !isUniqueNonemptyStringArray(feature.confidentialWorkloadMeasurements)
        || !isUniqueNonemptyStringArray(feature.infrastructurePolicyVersions)
        || !isNonemptyString(feature.legalNoticesVersion)
        || (feature.representativePins !== null && !isRecord(feature.representativePins))
      ) {
        errors.push('Each feature must conform to FeatureEvidenceV1');
      }
      if (isRecord(feature) && isRecord(feature.representativePins)) {
        const pins = feature.representativePins;
        if (
          !isNonemptyString(pins.packageVersion)
          || typeof pins.artifactHash !== 'string'
          || !SHA256_PATTERN.test(pins.artifactHash)
          || typeof pins.extensionManifestHash !== 'string'
          || !SHA256_PATTERN.test(pins.extensionManifestHash)
        ) {
          errors.push('representativePins must contain packageVersion and both SHA-256 hashes');
        }
      }
    }
  }
  for (const field of [
    'modelRuntimeHashes',
    'confidentialWorkloadMeasurements',
    'infrastructurePolicyVersions',
  ] as const) {
    if (Array.isArray(value[field]) && !isUniqueNonemptyStringArray(value[field])) {
      errors.push(`${field} must be a unique array of nonempty strings`);
    }
  }
  if (
    Array.isArray(value.completedSlices)
    && !value.completedSlices.every(
      (slice) => typeof slice === 'number' && Number.isInteger(slice) && slice >= 1,
    )
  ) {
    errors.push('completedSlices must contain positive integers');
  } else if (
    Array.isArray(value.completedSlices)
    && new Set(value.completedSlices).size !== value.completedSlices.length
  ) {
    errors.push('completedSlices must not contain duplicates');
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
  for (const evidenceId of manifest.commerce.freezeEvidence) {
    const evidence = manifest.evidence.find((candidate) => candidate.id === evidenceId);
    if (!evidence) {
      errors.push(`Commerce references missing freeze evidence ${evidenceId}`);
    } else if (
      manifest.commerce.newSalesEnabled
      && !evidence.requiredForStates.includes('Released')
    ) {
      errors.push(`Commerce freeze evidence ${evidenceId} must be required for Released state`);
    }
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

function isPathBeneath(root: string, candidate: string): boolean {
  const { path } = getPlatform();
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  return candidate.startsWith(rootPrefix);
}

function confinedPath(
  root: string,
  relativePath: string,
  resolveRealPath: (absolutePath: string) => string,
): { path: string | null; reason?: 'lexical' | 'real' | 'unresolved' } {
  const { path } = getPlatform();
  const absoluteRoot = path.resolve(root);
  const absolutePath = path.resolve(absoluteRoot, relativePath);
  if (!isPathBeneath(absoluteRoot, absolutePath)) return { path: null, reason: 'lexical' };

  try {
    const realRoot = path.resolve(resolveRealPath(absoluteRoot));
    const realPath = path.resolve(resolveRealPath(absolutePath));
    return isPathBeneath(realRoot, realPath)
      ? { path: realPath }
      : { path: null, reason: 'real' };
  } catch {
    return { path: null, reason: 'unresolved' };
  }
}

type KeyState = 'valid' | 'not-yet-valid' | 'expired' | 'invalid';

function validAt(key: TrustedReleaseKeyV1, now: Date): KeyState {
  if (key.algorithm !== 'Ed25519') return 'invalid';
  if (!isRfc3339DateTime(key.validFrom) || !isRfc3339DateTime(key.validUntil)) {
    return 'invalid';
  }
  const validFrom = parseRfc3339DateTime(key.validFrom);
  const validUntil = parseRfc3339DateTime(key.validUntil);
  if (
    !Number.isFinite(validFrom)
    || !Number.isFinite(validUntil)
    || validFrom >= validUntil
  ) return 'invalid';
  const instant = now.getTime();
  if (instant < validFrom) return 'not-yet-valid';
  if (instant > validUntil) return 'expired';
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
    if (key.algorithm !== 'Ed25519') {
      errors.push(`Release signing key ${key.id} uses unsupported algorithm ${key.algorithm}`);
    } else if (keyState === 'invalid') {
      errors.push(`Release signing key ${key.id} has invalid validity date strings or window`);
    } else if (keyState === 'not-yet-valid') {
      errors.push(`Release signing key ${key.id} is not yet valid`);
    } else if (keyState === 'expired') {
      errors.push(`Release signing key ${key.id} is expired`);
    } else if (!verifyKeySignature(canonicalizeReleaseManifest(manifest), manifest.signature, key)) {
      errors.push('Release manifest signature is invalid');
    }
  }

  for (const repository of ['core', 'representative', 'website'] as const) {
    const verifier = options.sourceProvenance?.[repository];
    if (!verifier) {
      errors.push(`${repository} provenance verifier is required`);
      continue;
    }
    const source = manifest.repositories[repository];
    try {
      if (!verifier.isAncestor(source.sourceCommit, verifier.headCommit)) {
        errors.push(`${repository} sourceCommit is not an ancestor of HEAD`);
      }
      if (verifier.treeHash(source.sourceCommit) !== source.sourceTreeHash) {
        errors.push(`${repository} sourceTreeHash does not match the source commit tree`);
      }
    } catch {
      errors.push(`${repository} provenance verification failed`);
    }
  }

  const released = manifest.features.filter(
    (feature) => feature.state === 'Released' || feature.state === 'FieldProven',
  );
  const requiredArtifacts = new Set(released.flatMap((feature) => feature.signedArtifactNames));
  const requiredEvidence = new Set([
    ...released.flatMap((feature) => feature.evidenceIds),
    ...manifest.commerce.freezeEvidence,
  ]);
  const verifiesFiles = requiredArtifacts.size > 0 || requiredEvidence.size > 0;
  if (requiredArtifacts.size > 0 && !options.artifactRoot) {
    errors.push('Released features require an explicitly supplied artifact root');
  }
  if (verifiesFiles && !options.hashFile) {
    errors.push('Release verification requires a file hash implementation');
  }
  if (verifiesFiles && !options.resolveRealPath) {
    errors.push('Release verification requires a real-path resolver');
  }

  for (const artifact of manifest.signedArtifacts) {
    if (!requiredArtifacts.has(artifact.name)) continue;
    const confined = options.artifactRoot && options.resolveRealPath
      ? confinedPath(options.artifactRoot, artifact.path, options.resolveRealPath)
      : { path: null };
    if (!confined.path) {
      errors.push(
        confined.reason === 'real'
          ? `Artifact ${artifact.name} real path escapes the artifact root`
          : confined.reason === 'unresolved'
            ? `Artifact ${artifact.name} real path could not be resolved`
          : `Artifact ${artifact.name} path does not resolve beneath the artifact root`,
      );
      continue;
    }
    if (options.hashFile) {
      try {
        if (options.hashFile(confined.path) !== artifact.sha256) {
          errors.push(`Artifact ${artifact.name} hash does not match`);
        }
      } catch {
        errors.push(`Artifact ${artifact.name} could not be hashed`);
      }
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

  for (const evidence of manifest.evidence) {
    if (!requiredEvidence.has(evidence.id)) continue;
    const root = options.evidenceRoots?.[evidence.repository];
    if (!root) {
      errors.push(`Evidence ${evidence.id} has no supplied ${evidence.repository} root`);
      continue;
    }
    const confined = options.resolveRealPath
      ? confinedPath(root, evidence.path, options.resolveRealPath)
      : { path: null };
    if (!confined.path) {
      errors.push(
        confined.reason === 'real'
          ? `Evidence ${evidence.id} real path escapes its repository root`
          : confined.reason === 'unresolved'
            ? `Evidence ${evidence.id} real path could not be resolved`
          : `Evidence ${evidence.id} path escapes its repository root`,
      );
    } else if (options.hashFile) {
      try {
        if (options.hashFile(confined.path) !== evidence.sha256) {
          errors.push(`Evidence ${evidence.id} hash does not match`);
        }
      } catch {
        errors.push(`Evidence ${evidence.id} could not be hashed`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
