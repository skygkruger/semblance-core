#!/usr/bin/env node
'use strict';

const { createHash, createPublicKey, verify: verifySignature } = require('node:crypto');
const { readFileSync, realpathSync } = require('node:fs');
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

function validateRequiredShape(manifest) {
  const errors = [];
  const requiredTopLevel = [
    'schemaVersion', 'releaseId', 'generatedAt', 'repositories', 'signedArtifacts',
    'evidence', 'commerce', 'protocolVersions', 'modelRuntimeHashes',
    'confidentialWorkloadMeasurements', 'infrastructurePolicyVersions',
    'legalNoticesVersion', 'completedSlices', 'features', 'signatureKeyId', 'signature',
  ];
  if (!isObject(manifest)) return [error('SCHEMA_INVALID', 'Manifest must be an object')];
  for (const field of requiredTopLevel) {
    if (!(field in manifest)) errors.push(error('SCHEMA_INVALID', `Missing required field ${field}`, field));
  }
  if (manifest.schemaVersion !== 1) {
    errors.push(error('SCHEMA_INVALID', 'schemaVersion must equal 1', 'schemaVersion'));
  }
  if (!isNonemptyString(manifest.releaseId)) {
    errors.push(error('SCHEMA_INVALID', 'releaseId must be nonempty', 'releaseId'));
  }
  if (!isNonemptyString(manifest.generatedAt) || !Number.isFinite(Date.parse(manifest.generatedAt))) {
    errors.push(error('SCHEMA_INVALID', 'generatedAt must be a date-time', 'generatedAt'));
  }
  if (!isObject(manifest.repositories)) {
    errors.push(error('SCHEMA_INVALID', 'repositories must be an object', 'repositories'));
  } else {
    for (const name of REPOSITORY_NAMES) {
      const repository = manifest.repositories[name];
      if (!isObject(repository)
        || !isNonemptyString(repository.sourceCommit)
        || !isNonemptyString(repository.sourceTreeHash)) {
        errors.push(error(
          'SCHEMA_INVALID',
          `${name} repository requires sourceCommit and sourceTreeHash`,
          `repositories.${name}`,
        ));
      }
    }
    const representative = manifest.repositories.representative;
    if (isObject(representative) && !isNonemptyString(representative.packageVersion)) {
      errors.push(error(
        'SCHEMA_INVALID',
        'representative repository requires packageVersion',
        'repositories.representative.packageVersion',
      ));
    }
  }
  for (const field of [
    'signedArtifacts', 'evidence', 'modelRuntimeHashes',
    'confidentialWorkloadMeasurements', 'infrastructurePolicyVersions',
    'completedSlices', 'features',
  ]) {
    if (!Array.isArray(manifest[field])) {
      errors.push(error('SCHEMA_INVALID', `${field} must be an array`, field));
    }
  }
  if (!isObject(manifest.commerce)
    || typeof manifest.commerce.newSalesEnabled !== 'boolean'
    || !Array.isArray(manifest.commerce.freezeEvidence)) {
    errors.push(error('SCHEMA_INVALID', 'commerce is invalid', 'commerce'));
  }
  if (!isObject(manifest.protocolVersions)
    || Object.values(manifest.protocolVersions).some(
      (version) => !Number.isInteger(version) || version < 0,
    )) {
    errors.push(error('SCHEMA_INVALID', 'protocolVersions is invalid', 'protocolVersions'));
  }
  if (!isNonemptyString(manifest.legalNoticesVersion)) {
    errors.push(error('SCHEMA_INVALID', 'legalNoticesVersion must be nonempty', 'legalNoticesVersion'));
  }
  if (typeof manifest.signatureKeyId !== 'string' || typeof manifest.signature !== 'string') {
    errors.push(error('SCHEMA_INVALID', 'signature fields must be strings', 'signature'));
  }
  if (Array.isArray(manifest.features)) {
    for (const [index, feature] of manifest.features.entries()) {
      if (!isObject(feature)
        || !isNonemptyString(feature.id)
        || !isNonemptyString(feature.name)
        || !REPOSITORY_NAMES.includes(feature.repository)
        || !ALL_STATES.has(feature.state)
        || typeof feature.usesDigitalRepresentative !== 'boolean'
        || !isStringArray(feature.signedArtifactNames)
        || !isStringArray(feature.evidenceIds)) {
        errors.push(error('SCHEMA_INVALID', 'Feature is invalid', `features.${index}`));
      }
    }
  }
  if (Array.isArray(manifest.signedArtifacts)) {
    for (const [index, artifact] of manifest.signedArtifacts.entries()) {
      if (!isObject(artifact)
        || !isNonemptyString(artifact.name)
        || !isNonemptyString(artifact.path)
        || typeof artifact.sha256 !== 'string'
        || !SHA256_PATTERN.test(artifact.sha256)
        || typeof artifact.signature !== 'string'
        || typeof artifact.signatureKeyId !== 'string') {
        errors.push(error('SCHEMA_INVALID', 'Signed artifact is invalid', `signedArtifacts.${index}`));
      }
    }
  }
  if (Array.isArray(manifest.evidence)) {
    for (const [index, evidence] of manifest.evidence.entries()) {
      if (!isObject(evidence)
        || !isNonemptyString(evidence.id)
        || !REPOSITORY_NAMES.includes(evidence.repository)
        || !isNonemptyString(evidence.path)
        || typeof evidence.sha256 !== 'string'
        || !SHA256_PATTERN.test(evidence.sha256)
        || !Array.isArray(evidence.requiredForStates)
        || evidence.requiredForStates.length === 0
        || evidence.requiredForStates.some((state) => !ALL_STATES.has(state))) {
        errors.push(error('SCHEMA_INVALID', 'Evidence entry is invalid', `evidence.${index}`));
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

/**
 * Verify a release manifest with injected repository and filesystem adapters.
 * Concrete Git and filesystem adapters are constructed only by this script's CLI.
 */
async function verifyReleaseManifest(manifest, adapters) {
  const errors = validateRequiredShape(manifest);
  if (errors.length > 0) return { valid: false, errors };

  const now = adapters.now ?? new Date();
  const releasedFeatures = manifest.features.filter((feature) => RELEASE_STATES.has(feature.state));
  const requiresSignature = releasedFeatures.length > 0
    || manifest.signatureKeyId.length > 0
    || manifest.signature.length > 0;

  if (requiresSignature) {
    const key = activeTrustedKey(adapters.trustedKeys, manifest.signatureKeyId, now);
    const { signature: _signature, ...signable } = manifest;
    if (!key || !verifyEd25519(canonicalJSON(signable), manifest.signature, key.publicKey)) {
      errors.push(error('SIGNATURE_INVALID', 'Release manifest signature is invalid', 'signature'));
    }
  }

  for (const name of REPOSITORY_NAMES) {
    const source = manifest.repositories[name];
    const repository = adapters.repositories?.[name];
    let ancestor = false;
    try {
      ancestor = Boolean(repository?.isAncestor(source.sourceCommit, repository.headCommit));
    } catch {
      ancestor = false;
    }
    if (!ancestor) {
      errors.push(error(
        'SOURCE_NOT_ANCESTOR',
        `${name} sourceCommit is not an ancestor of HEAD`,
        `repositories.${name}.sourceCommit`,
      ));
    }
    let actualTree = null;
    try {
      actualTree = repository?.treeHash(source.sourceCommit) ?? null;
    } catch {
      actualTree = null;
    }
    if (actualTree !== source.sourceTreeHash) {
      errors.push(error(
        'TREE_HASH_MISMATCH',
        `${name} sourceTreeHash does not match the pinned commit`,
        `repositories.${name}.sourceTreeHash`,
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

  const artifactNames = new Set(manifest.signedArtifacts.map((artifact) => artifact.name));
  const evidenceById = new Map(manifest.evidence.map((evidence) => [evidence.id, evidence]));
  for (const feature of releasedFeatures) {
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
    if (feature.usesDigitalRepresentative) {
      const pins = feature.representativePins;
      const representative = manifest.repositories.representative;
      if (!isObject(pins)
        || pins.packageVersion !== representative.packageVersion
        || pins.artifactHash !== representative.artifactHash
        || pins.extensionManifestHash !== representative.extensionManifestHash
        || !isNonemptyString(pins.artifactHash)
        || !isNonemptyString(pins.extensionManifestHash)) {
        errors.push(error(
          'DR_PIN_MISSING',
          `Feature ${feature.id} requires matching DR package and extension pins`,
          `features.${feature.id}.representativePins`,
        ));
      }
    }
  }

  const requiredArtifacts = new Set(
    releasedFeatures.flatMap((feature) => feature.signedArtifactNames),
  );
  for (const artifact of manifest.signedArtifacts) {
    if (!requiredArtifacts.has(artifact.name)) continue;
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

  const requiredEvidence = new Set([
    ...releasedFeatures.flatMap((feature) => feature.evidenceIds),
    ...manifest.commerce.freezeEvidence,
  ]);
  for (const evidence of manifest.evidence) {
    if (!requiredEvidence.has(evidence.id)) continue;
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
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument.startsWith('--') && argv[index + 1] && !argv[index + 1].startsWith('--')) {
      options[argument.slice(2)] = argv[index + 1];
      index += 1;
    } else if (argument.startsWith('--')) {
      options[argument.slice(2)] = true;
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
      return git(root, ['merge-base', '--is-ancestor', sourceCommit, headCommit]).status === 0;
    },
    treeHash(sourceCommit) {
      const result = git(root, ['rev-parse', `${sourceCommit}^{tree}`]);
      return result.status === 0 ? result.stdout.trim() : null;
    },
  };
}

async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.verify) {
    console.error('Usage: node scripts/release-manifest.js --verify [options]');
    return 1;
  }
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
    repositories = args['schema-only']
      ? Object.fromEntries(REPOSITORY_NAMES.map((name) => {
          const source = manifest.repositories[name];
          return [name, {
            root: repositoryPaths[name],
            headCommit: source.sourceCommit,
            isAncestor: () => true,
            treeHash: () => source.sourceTreeHash,
          }];
        }))
      : Object.fromEntries(
          REPOSITORY_NAMES.map((name) => [name, gitRepositoryAdapter(repositoryPaths[name])]),
        );
  } catch (cause) {
    console.error(`RELEASE_MANIFEST_READ_FAILED: ${cause.message}`);
    return 1;
  }

  const result = await verifyReleaseManifest(manifest, {
    trustedKeys,
    repositories,
    artifactRoot: resolve(String(args['artifact-root'] ?? join(root, 'release', 'artifacts'))),
    readFile: readFileSync,
    realpath: realpathSync,
  });
  if (args['require-legal-version'] && manifest.legalNoticesVersion === 'unversioned') {
    result.errors.push(error(
      'LEGAL_VERSION_UNPINNED',
      'Release workflow requires a pinned legal notices version',
      'legalNoticesVersion',
    ));
    result.valid = false;
  }

  for (const violation of result.errors) {
    console.error(`${violation.code}: ${violation.message}`);
  }
  if (result.valid) console.log(`Release manifest verified: ${manifest.releaseId}`);
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
