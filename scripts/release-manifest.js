#!/usr/bin/env node
'use strict';

const { createHash, createPublicKey, verify: verifySignature } = require('node:crypto');
const { readFileSync, readdirSync, realpathSync } = require('node:fs');
const { dirname, isAbsolute, join, relative, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const REPOSITORY_NAMES = ['core', 'representative', 'website'];
const RELEASE_STATES = new Set(['Released', 'FieldProven']);
const ALL_STATES = new Set([
  'Specified',
  'Implemented',
  'Wired',
  'DataVerified',
  'RuntimeVerified',
  'AdversariallyVerified',
  'Released',
  'FieldProven',
]);
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const GIT_OBJECT_PATTERN = /^[a-f0-9]{40,64}$/;
const TOP_LEVEL_KEYS = [
  'schemaVersion', 'releaseId', 'generatedAt', 'repositories', 'signedArtifacts',
  'evidence', 'commerce', 'protocolVersions', 'modelRuntimeHashes',
  'confidentialWorkloadMeasurements', 'infrastructurePolicyVersions',
  'legalNoticesVersion', 'completedSlices', 'features', 'signatureKeyId', 'signature',
];
const SOURCE_KEYS = ['sourceCommit', 'sourceTreeHash'];
const REPRESENTATIVE_SOURCE_KEYS = [
  ...SOURCE_KEYS, 'packageVersion', 'artifactHash', 'extensionManifestHash',
];
const ARTIFACT_KEYS = ['name', 'path', 'sha256', 'signature', 'signatureKeyId'];
const EVIDENCE_KEYS = ['id', 'repository', 'path', 'sha256', 'requiredForStates'];
const FEATURE_KEYS = [
  'id', 'name', 'repository', 'state', 'usesDigitalRepresentative',
  'signedArtifactNames', 'evidenceIds', 'protocolVersions', 'modelRuntimeHashes',
  'confidentialWorkloadMeasurements', 'infrastructurePolicyVersions',
  'legalNoticesVersion', 'representativePins',
];
const REPRESENTATIVE_PIN_KEYS = ['packageVersion', 'artifactHash', 'extensionManifestHash'];
const RFC3339_DATE = /^(\d\d\d\d)-(\d\d)-(\d\d)$/;
const RFC3339_TIME = /^(\d\d):(\d\d):(\d\d(?:\.\d+)?)(z|([+-])(\d\d)(?::?(\d\d))?)$/i;
const DAYS_PER_MONTH = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function canonicalJSON(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${canonicalJSON(value[key])}`,
    ).join(',')}}`;
  }
  return String(value);
}

function error(code, message, path) {
  return path ? { code, message, path } : { code, message };
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonemptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isStringArray(value) {
  return Array.isArray(value) && value.every(isNonemptyString);
}

function isUniqueStringArray(value) {
  return isStringArray(value) && new Set(value).size === value.length;
}

function isVersionMap(value) {
  return isObject(value) && Object.values(value).every(
    (version) => Number.isInteger(version) && version >= 0,
  );
}

function isRfc3339(value) {
  if (typeof value !== 'string') return false;
  const parts = value.split(/t|\s/i);
  if (parts.length !== 2) return false;
  const dateMatch = RFC3339_DATE.exec(parts[0]);
  const timeMatch = RFC3339_TIME.exec(parts[1]);
  if (!dateMatch || !timeMatch) return false;
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const maximumDay = month === 2
    && year % 4 === 0
    && (year % 100 !== 0 || year % 400 === 0)
    ? 29
    : DAYS_PER_MONTH[month];
  if (month < 1 || month > 12 || day < 1 || maximumDay === undefined || day > maximumDay) {
    return false;
  }
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3]);
  const timezoneSign = timeMatch[5] === '-' ? -1 : 1;
  const timezoneHour = Number(timeMatch[6] ?? 0);
  const timezoneMinute = Number(timeMatch[7] ?? 0);
  if (timezoneHour > 23 || timezoneMinute > 59) return false;
  if (hour <= 23 && minute <= 59 && second < 60) return true;
  const utcMinute = minute - timezoneMinute * timezoneSign;
  const utcHour = hour - timezoneHour * timezoneSign - (utcMinute < 0 ? 1 : 0);
  return (utcHour === 23 || utcHour === -1)
    && (utcMinute === 59 || utcMinute === -1)
    && second < 61;
}

function rejectUnknown(value, allowed, label, errors) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      errors.push(error('SCHEMA_INVALID', `${label} has unknown property ${key}`, `${label}.${key}`));
    }
  }
}

function requireKeys(value, required, label, errors) {
  for (const key of required) {
    if (!(key in value)) {
      errors.push(error('SCHEMA_INVALID', `${label} is missing ${key}`, `${label}.${key}`));
    }
  }
}

function hasDeepDuplicates(values) {
  if (!Array.isArray(values)) return false;
  const canonical = values.map(canonicalJSON);
  return new Set(canonical).size !== canonical.length;
}

function validateManifestStructure(manifest) {
  const errors = [];
  if (!isObject(manifest)) return [error('SCHEMA_INVALID', 'Manifest must be an object')];
  rejectUnknown(manifest, TOP_LEVEL_KEYS, 'manifest', errors);
  requireKeys(manifest, TOP_LEVEL_KEYS, 'manifest', errors);
  if (manifest.schemaVersion !== 1) {
    errors.push(error('SCHEMA_INVALID', 'schemaVersion must equal 1', 'schemaVersion'));
  }
  if (!isNonemptyString(manifest.releaseId)) {
    errors.push(error('SCHEMA_INVALID', 'releaseId must be nonempty', 'releaseId'));
  }
  if (!isRfc3339(manifest.generatedAt)) {
    errors.push(error('SCHEMA_INVALID', 'generatedAt must be an RFC 3339 date-time', 'generatedAt'));
  }
  if (!isObject(manifest.repositories)) {
    errors.push(error('SCHEMA_INVALID', 'repositories must be an object', 'repositories'));
  } else {
    rejectUnknown(manifest.repositories, REPOSITORY_NAMES, 'repositories', errors);
    requireKeys(manifest.repositories, REPOSITORY_NAMES, 'repositories', errors);
    for (const name of REPOSITORY_NAMES) {
      const repository = manifest.repositories[name];
      if (!isObject(repository)) {
        errors.push(error('SCHEMA_INVALID', `${name} repository must be an object`, `repositories.${name}`));
        continue;
      }
      const allowed = name === 'representative' ? REPRESENTATIVE_SOURCE_KEYS : SOURCE_KEYS;
      rejectUnknown(repository, allowed, `repositories.${name}`, errors);
      requireKeys(repository, allowed, `repositories.${name}`, errors);
      if (typeof repository.sourceCommit !== 'string' || !GIT_OBJECT_PATTERN.test(repository.sourceCommit)) {
        errors.push(error('SCHEMA_INVALID', `${name} sourceCommit is malformed`, `repositories.${name}.sourceCommit`));
      }
      if (typeof repository.sourceTreeHash !== 'string' || !GIT_OBJECT_PATTERN.test(repository.sourceTreeHash)) {
        errors.push(error('SCHEMA_INVALID', `${name} sourceTreeHash is malformed`, `repositories.${name}.sourceTreeHash`));
      }
    }
    const representative = manifest.repositories.representative;
    if (isObject(representative)) {
      if (!isNonemptyString(representative.packageVersion)) {
        errors.push(error('SCHEMA_INVALID', 'representative packageVersion is invalid', 'repositories.representative.packageVersion'));
      }
      for (const field of ['artifactHash', 'extensionManifestHash']) {
        const value = representative[field];
        if (value !== null && (typeof value !== 'string' || !SHA256_PATTERN.test(value))) {
          errors.push(error('SCHEMA_INVALID', `representative ${field} is invalid`, `repositories.representative.${field}`));
        }
      }
    }
  }
  for (const field of [
    'signedArtifacts', 'evidence', 'modelRuntimeHashes',
    'confidentialWorkloadMeasurements', 'infrastructurePolicyVersions',
    'completedSlices', 'features',
  ]) {
    if (!Array.isArray(manifest[field])) {
      errors.push(error('SCHEMA_INVALID', `${field} must be an array`, field));
    } else if (hasDeepDuplicates(manifest[field])) {
      errors.push(error('SCHEMA_INVALID', `${field} must not contain duplicates`, field));
    }
  }
  if (!isObject(manifest.commerce)) {
    errors.push(error('SCHEMA_INVALID', 'commerce is invalid', 'commerce'));
  } else {
    rejectUnknown(manifest.commerce, ['newSalesEnabled', 'freezeEvidence'], 'commerce', errors);
    requireKeys(manifest.commerce, ['newSalesEnabled', 'freezeEvidence'], 'commerce', errors);
    if (typeof manifest.commerce.newSalesEnabled !== 'boolean'
      || !isUniqueStringArray(manifest.commerce.freezeEvidence)) {
      errors.push(error('SCHEMA_INVALID', 'commerce is invalid', 'commerce'));
    }
  }
  if (!isVersionMap(manifest.protocolVersions)) {
    errors.push(error('SCHEMA_INVALID', 'protocolVersions is invalid', 'protocolVersions'));
  }
  for (const field of [
    'modelRuntimeHashes', 'confidentialWorkloadMeasurements', 'infrastructurePolicyVersions',
  ]) {
    if (!isUniqueStringArray(manifest[field])) {
      errors.push(error('SCHEMA_INVALID', `${field} must be a unique string set`, field));
    }
  }
  if (!Array.isArray(manifest.completedSlices)
    || manifest.completedSlices.some((slice) => !Number.isInteger(slice) || slice < 1)
    || new Set(manifest.completedSlices).size !== manifest.completedSlices.length) {
    errors.push(error('SCHEMA_INVALID', 'completedSlices is invalid', 'completedSlices'));
  }
  if (!isNonemptyString(manifest.legalNoticesVersion)) {
    errors.push(error('SCHEMA_INVALID', 'legalNoticesVersion must be nonempty', 'legalNoticesVersion'));
  }
  if (typeof manifest.signatureKeyId !== 'string' || typeof manifest.signature !== 'string') {
    errors.push(error('SCHEMA_INVALID', 'signature fields must be strings', 'signature'));
  }
  if (Array.isArray(manifest.features)) {
    for (const [index, feature] of manifest.features.entries()) {
      const label = `features.${index}`;
      if (!isObject(feature)) {
        errors.push(error('SCHEMA_INVALID', 'Feature is invalid', label));
        continue;
      }
      rejectUnknown(feature, FEATURE_KEYS, label, errors);
      requireKeys(feature, FEATURE_KEYS, label, errors);
      if (!isNonemptyString(feature.id)
        || !isNonemptyString(feature.name)
        || !REPOSITORY_NAMES.includes(feature.repository)
        || !ALL_STATES.has(feature.state)
        || typeof feature.usesDigitalRepresentative !== 'boolean'
        || !isUniqueStringArray(feature.signedArtifactNames)
        || !isUniqueStringArray(feature.evidenceIds)
        || !isVersionMap(feature.protocolVersions)
        || !isUniqueStringArray(feature.modelRuntimeHashes)
        || !isUniqueStringArray(feature.confidentialWorkloadMeasurements)
        || !isUniqueStringArray(feature.infrastructurePolicyVersions)
        || !isNonemptyString(feature.legalNoticesVersion)
        || (feature.representativePins !== null && !isObject(feature.representativePins))) {
        errors.push(error('SCHEMA_INVALID', 'Feature is invalid', label));
      }
      if (isObject(feature.representativePins)) {
        rejectUnknown(feature.representativePins, REPRESENTATIVE_PIN_KEYS, `${label}.representativePins`, errors);
        requireKeys(feature.representativePins, REPRESENTATIVE_PIN_KEYS, `${label}.representativePins`, errors);
        if (!isNonemptyString(feature.representativePins.packageVersion)
          || typeof feature.representativePins.artifactHash !== 'string'
          || !SHA256_PATTERN.test(feature.representativePins.artifactHash)
          || typeof feature.representativePins.extensionManifestHash !== 'string'
          || !SHA256_PATTERN.test(feature.representativePins.extensionManifestHash)) {
          errors.push(error('SCHEMA_INVALID', 'representativePins is invalid', `${label}.representativePins`));
        }
      }
    }
  }
  if (Array.isArray(manifest.signedArtifacts)) {
    for (const [index, artifact] of manifest.signedArtifacts.entries()) {
      const label = `signedArtifacts.${index}`;
      if (!isObject(artifact)) {
        errors.push(error('SCHEMA_INVALID', 'Signed artifact is invalid', label));
        continue;
      }
      rejectUnknown(artifact, ARTIFACT_KEYS, label, errors);
      requireKeys(artifact, ARTIFACT_KEYS, label, errors);
      if (!isNonemptyString(artifact.name)
        || !isNonemptyString(artifact.path)
        || typeof artifact.sha256 !== 'string'
        || !SHA256_PATTERN.test(artifact.sha256)
        || !isNonemptyString(artifact.signature)
        || !isNonemptyString(artifact.signatureKeyId)) {
        errors.push(error('SCHEMA_INVALID', 'Signed artifact is invalid', label));
      }
    }
  }
  if (Array.isArray(manifest.evidence)) {
    for (const [index, evidence] of manifest.evidence.entries()) {
      const label = `evidence.${index}`;
      if (!isObject(evidence)) {
        errors.push(error('SCHEMA_INVALID', 'Evidence entry is invalid', label));
        continue;
      }
      rejectUnknown(evidence, EVIDENCE_KEYS, label, errors);
      requireKeys(evidence, EVIDENCE_KEYS, label, errors);
      if (!isNonemptyString(evidence.id)
        || !REPOSITORY_NAMES.includes(evidence.repository)
        || !isNonemptyString(evidence.path)
        || typeof evidence.sha256 !== 'string'
        || !SHA256_PATTERN.test(evidence.sha256)
        || !isUniqueStringArray(evidence.requiredForStates)
        || evidence.requiredForStates.length === 0
        || evidence.requiredForStates.some((state) => !ALL_STATES.has(state))) {
        errors.push(error('SCHEMA_INVALID', 'Evidence entry is invalid', label));
      }
    }
  }
  return errors;
}

function verifyEd25519(payload, signature, publicKey) {
  try {
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKey, 'base64')]),
      format: 'der',
      type: 'spki',
    });
    return verifySignature(null, Buffer.from(payload), key, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}

function activeTrustedKey(trustedKeys, keyId, now) {
  const key = trustedKeys?.keys?.find((candidate) => candidate.id === keyId);
  if (!key || key.algorithm !== 'Ed25519') return null;
  const validFrom = Date.parse(key.validFrom);
  const validUntil = Date.parse(key.validUntil);
  if (!Number.isFinite(validFrom)
    || !Number.isFinite(validUntil)
    || validFrom >= validUntil
    || now.getTime() < validFrom
    || now.getTime() > validUntil) return null;
  return key;
}

function confinedPath(root, relativePath, realpath) {
  if (!root || !isNonemptyString(relativePath) || isAbsolute(relativePath)) return null;
  const absoluteRoot = resolve(root);
  const absolutePath = resolve(absoluteRoot, relativePath);
  const lexicalRelative = relative(absoluteRoot, absolutePath);
  if (lexicalRelative.startsWith('..') || isAbsolute(lexicalRelative)) return null;
  try {
    const realRoot = resolve(realpath(absoluteRoot));
    const realCandidate = resolve(realpath(absolutePath));
    const realRelative = relative(realRoot, realCandidate);
    return realRelative.startsWith('..') || isAbsolute(realRelative) ? null : realCandidate;
  } catch {
    return null;
  }
}

function hashFile(path, readFile) {
  return createHash('sha256').update(readFile(path)).digest('hex');
}

function listFiles(root, current = root) {
  return readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const path = join(current, entry.name);
    return entry.isDirectory() ? listFiles(root, path) : [relative(root, path).split('\\').join('/')];
  });
}

function equalStringSets(left, right) {
  return canonicalJSON([...left].sort()) === canonicalJSON([...right].sort());
}

function validateManifestPolicy(manifest) {
  const errors = [];
  const artifactNames = new Set();
  for (const artifact of manifest.signedArtifacts) {
    if (artifactNames.has(artifact.name)) {
      errors.push(error('SCHEMA_INVALID', `Duplicate signed artifact ${artifact.name}`, 'signedArtifacts'));
    }
    artifactNames.add(artifact.name);
  }
  const evidenceById = new Map();
  for (const evidence of manifest.evidence) {
    if (evidenceById.has(evidence.id)) {
      errors.push(error('SCHEMA_INVALID', `Duplicate evidence ${evidence.id}`, 'evidence'));
    }
    evidenceById.set(evidence.id, evidence);
  }
  const featureIds = new Set();
  for (const feature of manifest.features) {
    if (featureIds.has(feature.id)) {
      errors.push(error('SCHEMA_INVALID', `Duplicate feature ${feature.id}`, 'features'));
    }
    featureIds.add(feature.id);

    if (canonicalJSON(feature.protocolVersions) !== canonicalJSON(manifest.protocolVersions)
      || !equalStringSets(feature.modelRuntimeHashes, manifest.modelRuntimeHashes)
      || !equalStringSets(
        feature.confidentialWorkloadMeasurements,
        manifest.confidentialWorkloadMeasurements,
      )
      || !equalStringSets(
        feature.infrastructurePolicyVersions,
        manifest.infrastructurePolicyVersions,
      )
      || feature.legalNoticesVersion !== manifest.legalNoticesVersion) {
      errors.push(error(
        'POLICY_PIN_MISMATCH',
        `Feature ${feature.id} policy pins do not match the manifest`,
        `features.${feature.id}`,
      ));
    }

    if (RELEASE_STATES.has(feature.state)) {
      const missingArtifact = feature.signedArtifactNames.length === 0
        || feature.signedArtifactNames.some((name) => !artifactNames.has(name));
      const missingEvidence = feature.evidenceIds.length === 0
        || feature.evidenceIds.some((id) => {
          const evidence = evidenceById.get(id);
          return !evidence || !evidence.requiredForStates.includes(feature.state);
        });
      if (missingArtifact || missingEvidence) {
        errors.push(error(
          'RELEASE_EVIDENCE_MISSING',
          `Feature ${feature.id} cannot enter ${feature.state} without pinned artifacts and evidence`,
          `features.${feature.id}.state`,
        ));
      }
    }

    if (feature.usesDigitalRepresentative) {
      const pins = feature.representativePins;
      const representative = manifest.repositories.representative;
      const referencedArtifacts = manifest.signedArtifacts.filter(
        (artifact) => feature.signedArtifactNames.includes(artifact.name),
      );
      const referencedEvidence = manifest.evidence.filter(
        (evidence) => feature.evidenceIds.includes(evidence.id)
          && evidence.repository === 'representative',
      );
      if (!isObject(pins)
        || pins.packageVersion !== representative.packageVersion
        || pins.artifactHash !== representative.artifactHash
        || pins.extensionManifestHash !== representative.extensionManifestHash
        || !referencedArtifacts.some((artifact) => artifact.sha256 === pins.artifactHash)
        || ![
          ...referencedArtifacts.map((artifact) => artifact.sha256),
          ...referencedEvidence.map((evidence) => evidence.sha256),
        ].includes(pins.extensionManifestHash)) {
        errors.push(error(
          'DR_PIN_MISSING',
          `Feature ${feature.id} requires specifically referenced DR package and extension pins`,
          `features.${feature.id}.representativePins`,
        ));
      }
    } else if (feature.representativePins !== null) {
      errors.push(error(
        'DR_PIN_MISSING',
        `Feature ${feature.id} must not declare DR pins`,
        `features.${feature.id}.representativePins`,
      ));
    }
  }

  if (manifest.commerce.newSalesEnabled && !manifest.completedSlices.includes(7)) {
    errors.push(error(
      'COMMERCE_ENABLED_BEFORE_SLICE_7',
      'New sales must remain disabled until Slice 7 evidence exists',
      'commerce.newSalesEnabled',
    ));
  }
  if (manifest.commerce.newSalesEnabled && manifest.commerce.freezeEvidence.length === 0) {
    errors.push(error(
      'COMMERCE_EVIDENCE_MISSING',
      'New sales require commerce freeze evidence',
      'commerce.freezeEvidence',
    ));
  }
  for (const evidenceId of manifest.commerce.freezeEvidence) {
    const evidence = evidenceById.get(evidenceId);
    if (!evidence || (manifest.commerce.newSalesEnabled
      && !evidence.requiredForStates.includes('Released'))) {
      errors.push(error(
        'COMMERCE_EVIDENCE_MISSING',
        `Commerce freeze evidence ${evidenceId} is invalid`,
        'commerce.freezeEvidence',
      ));
    }
  }
  return errors;
}

/**
 * Verify a release manifest with injected repository and filesystem adapters.
 * Concrete Git and filesystem adapters are constructed only by this script's CLI.
 */
async function verifyReleaseManifest(manifest, adapters) {
  const errors = validateManifestStructure(manifest);
  if (errors.length > 0) return { valid: false, errors };
  errors.push(...validateManifestPolicy(manifest));

  const now = adapters.now ?? new Date();
  const phase = adapters.phase ?? 'release';

  if (phase === 'release') {
    const key = activeTrustedKey(adapters.trustedKeys, manifest.signatureKeyId, now);
    const { signature: _signature, ...signable } = manifest;
    if (!key || !verifyEd25519(canonicalJSON(signable), manifest.signature, key.publicKey)) {
      errors.push(error('SIGNATURE_INVALID', 'Release manifest signature is invalid', 'signature'));
    }
  }

  for (const name of REPOSITORY_NAMES) {
    const source = manifest.repositories[name];
    const repository = adapters.repositories?.[name];
    try {
      if (!repository) throw new Error('repository adapter missing');
      if (!repository.isAncestor(source.sourceCommit, repository.headCommit)) {
        errors.push(error(
          'SOURCE_NOT_ANCESTOR',
          `${name} sourceCommit is not an ancestor of HEAD`,
          `repositories.${name}.sourceCommit`,
        ));
      }
      if (repository.treeHash(source.sourceCommit) !== source.sourceTreeHash) {
        errors.push(error(
          'TREE_HASH_MISMATCH',
          `${name} sourceTreeHash does not match the pinned commit`,
          `repositories.${name}.sourceTreeHash`,
        ));
      }
    } catch {
      errors.push(error(
        'SOURCE_VERIFICATION_FAILED',
        `${name} Git provenance verification failed`,
        `repositories.${name}`,
      ));
    }
  }

  if (phase === 'source') return { valid: errors.length === 0, errors };

  for (const artifact of manifest.signedArtifacts) {
    const path = confinedPath(adapters.artifactRoot, artifact.path, adapters.realpath);
    let actualHash = null;
    try {
      actualHash = path ? hashFile(path, adapters.readFile) : null;
    } catch {
      actualHash = null;
    }
    if (actualHash !== artifact.sha256) {
      errors.push(error(
        'ARTIFACT_HASH_MISMATCH',
        `Artifact ${artifact.name} hash does not match`,
        `signedArtifacts.${artifact.name}`,
      ));
    }
    const key = activeTrustedKey(adapters.trustedKeys, artifact.signatureKeyId, now);
    if (!key || !verifyEd25519(artifact.sha256, artifact.signature, key.publicKey)) {
      errors.push(error(
        'SIGNATURE_INVALID',
        `Artifact ${artifact.name} signature is invalid`,
        `signedArtifacts.${artifact.name}.signature`,
      ));
    }
  }

  for (const evidence of manifest.evidence) {
    const repository = adapters.repositories?.[evidence.repository];
    const path = confinedPath(repository?.root, evidence.path, adapters.realpath);
    let actualHash = null;
    try {
      actualHash = path ? hashFile(path, adapters.readFile) : null;
    } catch {
      actualHash = null;
    }
    if (actualHash !== evidence.sha256) {
      errors.push(error(
        'EVIDENCE_HASH_MISMATCH',
        `Evidence ${evidence.id} hash does not match`,
        `evidence.${evidence.id}`,
      ));
    }
  }

  return { valid: errors.length === 0, errors };
}

function parseArgs(argv) {
  const booleanFlags = new Set([
    'verify', 'verify-source', 'verify-release', 'require-legal-version',
    'require-exact-artifacts',
  ]);
  const valueFlags = new Set([
    'manifest', 'trusted-keys', 'core-repo', 'representative-repo',
    'website-repo', 'artifact-root',
  ]);
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) {
      throw new Error(`Unexpected positional argument: ${argument}`);
    }
    const name = argument.slice(2);
    if (name in options) throw new Error(`Duplicate argument: --${name}`);
    if (booleanFlags.has(name)) {
      options[name] = true;
    } else if (valueFlags.has(name)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for --${name}`);
      }
      options[name] = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: --${name}`);
    }
  }
  return options;
}

function git(repositoryPath, args) {
  return spawnSync('git', ['-C', repositoryPath, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function gitRepositoryAdapter(root) {
  const head = git(root, ['rev-parse', 'HEAD']);
  if (head.status !== 0) throw new Error(`Not a Git repository: ${root}`);
  return {
    root: resolve(root),
    headCommit: head.stdout.trim(),
    isAncestor(sourceCommit, headCommit) {
      const result = git(root, ['merge-base', '--is-ancestor', sourceCommit, headCommit]);
      if (result.status === 0) return true;
      if (result.status === 1) return false;
      throw new Error(result.stderr.trim() || 'git merge-base failed');
    },
    treeHash(sourceCommit) {
      const result = git(root, ['rev-parse', `${sourceCommit}^{tree}`]);
      if (result.status !== 0) throw new Error(result.stderr.trim() || 'git rev-parse failed');
      return result.stdout.trim();
    },
  };
}

async function runCli() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (cause) {
    console.error(`ARGUMENT_INVALID: ${cause.message}`);
    return 1;
  }
  const modes = ['verify', 'verify-source', 'verify-release'].filter((name) => args[name]);
  if (modes.length !== 1) {
    console.error(
      'ARGUMENT_INVALID: choose exactly one of --verify-source or --verify-release '
      + '(--verify aliases --verify-release)',
    );
    return 1;
  }
  const phase = args['verify-source'] ? 'source' : 'release';
  const root = resolve(__dirname, '..');
  const parent = dirname(root);
  const manifestPath = resolve(String(args.manifest ?? join(root, 'release', 'release-manifest.json')));
  const trustedKeysPath = resolve(String(
    args['trusted-keys'] ?? join(root, 'release', 'keys', 'trusted-release-keys.json'),
  ));
  const repositoryPaths = {
    core: resolve(String(args['core-repo'] ?? root)),
    representative: resolve(String(args['representative-repo'] ?? join(parent, 'semblence-representative'))),
    website: resolve(String(args['website-repo'] ?? join(parent, 'semblance-run'))),
  };

  let manifest;
  let trustedKeys;
  let repositories;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    trustedKeys = JSON.parse(readFileSync(trustedKeysPath, 'utf8'));
  } catch (cause) {
    console.error(`RELEASE_MANIFEST_READ_FAILED: ${cause.message}`);
    return 1;
  }
  const inputErrors = validateManifestStructure(manifest);
  if (inputErrors.length === 0) inputErrors.push(...validateManifestPolicy(manifest));
  if (inputErrors.length > 0) {
    for (const violation of inputErrors) {
      console.error(`${violation.code}: ${violation.message}`);
    }
    return 1;
  }
  try {
    repositories = Object.fromEntries(
      REPOSITORY_NAMES.map((name) => [name, gitRepositoryAdapter(repositoryPaths[name])]),
    );
  } catch (cause) {
    console.error(`SOURCE_VERIFICATION_FAILED: ${cause.message}`);
    return 1;
  }

  const result = await verifyReleaseManifest(manifest, {
    trustedKeys,
    repositories,
    phase,
    artifactRoot: resolve(String(args['artifact-root'] ?? join(root, 'release', 'artifacts'))),
    readFile: readFileSync,
    realpath: realpathSync,
  });
  if (phase === 'release'
    && args['require-legal-version']
    && manifest.legalNoticesVersion === 'unversioned') {
    result.errors.push(error(
      'LEGAL_VERSION_UNPINNED',
      'Release workflow requires a pinned legal notices version',
      'legalNoticesVersion',
    ));
    result.valid = false;
  }
  if (phase === 'release' && args['require-exact-artifacts']) {
    const expected = new Set(manifest.signedArtifacts.map((artifact) => artifact.path));
    let actual = [];
    try {
      actual = listFiles(resolve(String(
        args['artifact-root'] ?? join(root, 'release', 'artifacts'),
      )));
    } catch (cause) {
      result.errors.push(error(
        'ARTIFACT_SET_MISMATCH',
        `Could not enumerate built artifacts: ${cause.message}`,
        'signedArtifacts',
      ));
    }
    for (const path of actual) {
      if (!expected.has(path)) {
        result.errors.push(error(
          'ARTIFACT_SET_MISMATCH',
          `Built artifact is not pinned by the manifest: ${path}`,
          'signedArtifacts',
        ));
      }
    }
    for (const path of expected) {
      if (!actual.includes(path)) {
        result.errors.push(error(
          'ARTIFACT_SET_MISMATCH',
          `Pinned artifact was not built: ${path}`,
          'signedArtifacts',
        ));
      }
    }
    result.valid = result.errors.length === 0;
  }

  for (const violation of result.errors) {
    console.error(`${violation.code}: ${violation.message}`);
  }
  if (result.valid) {
    console.log(
      `Release manifest ${phase === 'source' ? 'source ' : ''}verified: ${manifest.releaseId}`,
    );
  }
  return result.valid ? 0 : 1;
}

module.exports = { verifyReleaseManifest };

if (require.main === module) {
  runCli().then((code) => {
    process.exitCode = code;
  }).catch((cause) => {
    console.error(`RELEASE_MANIFEST_FAILED: ${cause.message}`);
    process.exitCode = 1;
  });
}
