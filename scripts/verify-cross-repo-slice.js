#!/usr/bin/env node
'use strict';

/**
 * Slice 1 cross-repository gate.
 *
 * Verifies pinned source commits/tree hashes, byte-identical public claims,
 * reservation fixture compatibility, legal notices version, migration evidence
 * hashes, every raw evidence hash in the manifest, and fail-closed commerce
 * production freeze completion.
 *
 * Usage:
 *   node scripts/verify-cross-repo-slice.js \
 *     --manifest release/release-manifest.json \
 *     --core-repo /path/to/semblance-core \
 *     --representative-repo /path/to/semblence-representative \
 *     --website-repo /path/to/semblance-run
 */

const { createHash } = require('node:crypto');
const { existsSync, readFileSync, readdirSync, realpathSync, statSync } = require('node:fs');
const { dirname, isAbsolute, join, relative, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const REPOSITORY_NAMES = ['core', 'representative', 'website'];
const LEGAL_VERSION_PATTERN = /Legal version:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/;
const MIGRATION_EVIDENCE_IDS = [
  'migration-reservation-entitlement-split',
  'migration-commerce-freeze',
];

function error(code, message, path) {
  return path ? { code, message, path } : { code, message };
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sha256File(path) {
  return sha256Bytes(readFileSync(path));
}

function parseArgs(argv) {
  const valueFlags = new Set([
    'manifest', 'core-repo', 'representative-repo', 'website-repo',
  ]);
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) {
      throw new Error(`Unexpected positional argument: ${argument}`);
    }
    const name = argument.slice(2);
    if (name in options) throw new Error(`Duplicate argument: --${name}`);
    if (!valueFlags.has(name)) throw new Error(`Unknown argument: --${name}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${name}`);
    }
    options[name] = value;
    index += 1;
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

function confinedPath(root, relativePath) {
  if (!root || typeof relativePath !== 'string' || relativePath.length === 0) return null;
  if (isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes('..')) return null;
  const candidate = resolve(root, relativePath);
  let realRoot;
  let realCandidate;
  try {
    realRoot = realpathSync(root);
    realCandidate = realpathSync(candidate);
  } catch {
    return null;
  }
  const rel = relative(realRoot, realCandidate);
  if (rel.startsWith('..') || isAbsolute(rel)) return null;
  return realCandidate;
}

function verifySourcePins(manifest, repositories) {
  const errors = [];
  for (const name of REPOSITORY_NAMES) {
    const source = manifest.repositories?.[name];
    const repository = repositories[name];
    if (!isObject(source) || !repository) {
      errors.push(error(
        'SOURCE_VERIFICATION_FAILED',
        `${name} Git provenance verification failed`,
        `repositories.${name}`,
      ));
      continue;
    }
    try {
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
    } catch (cause) {
      errors.push(error(
        'SOURCE_VERIFICATION_FAILED',
        `${name} Git provenance verification failed: ${cause.message}`,
        `repositories.${name}`,
      ));
    }
  }
  return errors;
}

function verifyPublicClaims(coreRoot, websiteRoot) {
  const errors = [];
  const corePath = join(coreRoot, 'release', 'public-claims.v1.json');
  const websitePath = join(websiteRoot, 'contracts', 'public-claims.v1.json');
  if (!existsSync(corePath) || !existsSync(websitePath)) {
    errors.push(error(
      'PUBLIC_CLAIMS_MISMATCH',
      'public-claims.v1.json missing from core and/or website',
      'public-claims.v1.json',
    ));
    return errors;
  }
  const coreBytes = readFileSync(corePath);
  const websiteBytes = readFileSync(websitePath);
  if (!coreBytes.equals(websiteBytes)) {
    errors.push(error(
      'PUBLIC_CLAIMS_MISMATCH',
      'release/public-claims.v1.json is not byte-identical to website contracts/public-claims.v1.json',
      'public-claims.v1.json',
    ));
  }
  return errors;
}

function verifyReservationFixture(coreRoot, websiteRoot, representativeRoot) {
  const errors = [];
  const coreFixture = join(coreRoot, 'release', 'contracts', 'legacy-waitlist-token.fixture.json');
  const websiteFixture = join(websiteRoot, 'contracts', 'legacy-waitlist-token.fixture.json');
  const schemaPath = join(coreRoot, 'release', 'contracts', 'reservation-token-v0.schema.json');
  const migrationPath = join(
    representativeRoot,
    'docs',
    'release-manifests',
    'migrations',
    'slice-1-reservation-entitlement-split.json',
  );

  if (!existsSync(coreFixture) || !existsSync(websiteFixture)) {
    errors.push(error(
      'RESERVATION_FIXTURE_INCOMPATIBLE',
      'legacy-waitlist-token.fixture.json missing from core and/or website',
      'legacy-waitlist-token.fixture.json',
    ));
    return errors;
  }
  const coreBytes = readFileSync(coreFixture);
  const websiteBytes = readFileSync(websiteFixture);
  if (!coreBytes.equals(websiteBytes)) {
    errors.push(error(
      'RESERVATION_FIXTURE_INCOMPATIBLE',
      'core and website reservation fixtures are not byte-identical',
      'legacy-waitlist-token.fixture.json',
    ));
  }

  let fixture;
  try {
    fixture = JSON.parse(coreBytes.toString('utf8'));
  } catch {
    errors.push(error(
      'RESERVATION_FIXTURE_INCOMPATIBLE',
      'reservation fixture is not valid JSON',
      'legacy-waitlist-token.fixture.json',
    ));
    return errors;
  }

  if (!isObject(fixture)
    || typeof fixture.sub !== 'string'
    || fixture.type !== 'founding'
    || typeof fixture.seat !== 'number'
    || !Number.isInteger(fixture.seat)
    || fixture.seat < 1
    || fixture.seat > 500
    || typeof fixture.iat !== 'number'
    || 'tier' in fixture) {
    errors.push(error(
      'RESERVATION_FIXTURE_INCOMPATIBLE',
      'reservation fixture is not compatible with reservation_only mapping',
      'legacy-waitlist-token.fixture.json',
    ));
  }

  if (!existsSync(schemaPath)) {
    errors.push(error(
      'RESERVATION_FIXTURE_INCOMPATIBLE',
      'reservation-token-v0.schema.json is missing',
      'reservation-token-v0.schema.json',
    ));
  }

  if (!existsSync(migrationPath)) {
    errors.push(error(
      'RESERVATION_FIXTURE_INCOMPATIBLE',
      'reservation entitlement migration document is missing',
      'slice-1-reservation-entitlement-split.json',
    ));
    return errors;
  }

  let migration;
  try {
    migration = JSON.parse(readFileSync(migrationPath, 'utf8'));
  } catch {
    errors.push(error(
      'RESERVATION_FIXTURE_INCOMPATIBLE',
      'reservation entitlement migration document is not valid JSON',
      'slice-1-reservation-entitlement-split.json',
    ));
    return errors;
  }

  const classification = migration?.executableDefinition?.reservationContract?.classification;
  const fixtureRef = migration?.executableDefinition?.reservationContract?.fixture;
  if (classification !== 'reservation_only') {
    errors.push(error(
      'RESERVATION_FIXTURE_INCOMPATIBLE',
      'migration reservationContract.classification must be reservation_only',
      'slice-1-reservation-entitlement-split.json',
    ));
  }
  if (fixtureRef !== 'release/contracts/legacy-waitlist-token.fixture.json') {
    errors.push(error(
      'RESERVATION_FIXTURE_INCOMPATIBLE',
      'migration reservationContract.fixture path mismatch',
      'slice-1-reservation-entitlement-split.json',
    ));
  }

  return errors;
}

function verifyLegalVersion(manifest, websiteRoot) {
  const errors = [];
  const expected = manifest.legalNoticesVersion;
  if (typeof expected !== 'string' || expected.length === 0 || expected === 'unversioned') {
    errors.push(error(
      'LEGAL_VERSION_MISMATCH',
      'legalNoticesVersion must be a pinned dated version',
      'legalNoticesVersion',
    ));
    return errors;
  }

  const legalDir = join(websiteRoot, 'legal');
  if (!existsSync(legalDir) || !statSync(legalDir).isDirectory()) {
    errors.push(error(
      'LEGAL_VERSION_MISMATCH',
      'website legal/ directory is missing',
      'legal/',
    ));
    return errors;
  }

  const pages = readdirSync(legalDir).filter((name) => name.endsWith('.html')).sort();
  if (pages.length === 0) {
    errors.push(error(
      'LEGAL_VERSION_MISMATCH',
      'no website legal HTML pages found',
      'legal/',
    ));
    return errors;
  }

  for (const page of pages) {
    const text = readFileSync(join(legalDir, page), 'utf8');
    const match = LEGAL_VERSION_PATTERN.exec(text);
    if (!match || match[1] !== expected) {
      errors.push(error(
        'LEGAL_VERSION_MISMATCH',
        `legal/${page} does not declare Legal version: ${expected}`,
        `legal/${page}`,
      ));
    }
  }

  for (const feature of manifest.features ?? []) {
    if (feature.legalNoticesVersion !== expected) {
      errors.push(error(
        'LEGAL_VERSION_MISMATCH',
        `feature ${feature.id} legalNoticesVersion does not match manifest`,
        `features.${feature.id}.legalNoticesVersion`,
      ));
    }
  }

  return errors;
}

function verifyEvidenceHashes(manifest, repositories) {
  const errors = [];
  if (!Array.isArray(manifest.evidence)) {
    errors.push(error('EVIDENCE_HASH_MISMATCH', 'manifest.evidence must be an array', 'evidence'));
    return errors;
  }

  for (const evidence of manifest.evidence) {
    const repository = repositories[evidence.repository];
    const path = confinedPath(repository?.root, evidence.path);
    let actualHash = null;
    try {
      actualHash = path ? sha256File(path) : null;
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
  return errors;
}

function verifyMigrationEvidence(manifest, representativeRoot) {
  const errors = [];
  const evidenceById = new Map(
    (manifest.evidence ?? []).map((entry) => [entry.id, entry]),
  );

  const required = [
    {
      id: 'migration-reservation-entitlement-split',
      path: 'docs/release-manifests/migrations/slice-1-reservation-entitlement-split.json',
    },
    {
      id: 'migration-commerce-freeze',
      path: 'docs/release-manifests/migrations/slice-1-commerce-freeze.json',
    },
  ];

  for (const item of required) {
    const entry = evidenceById.get(item.id);
    if (!entry) {
      errors.push(error(
        'MIGRATION_EVIDENCE_HASH_MISMATCH',
        `Missing migration evidence entry ${item.id}`,
        `evidence.${item.id}`,
      ));
      continue;
    }
    if (entry.repository !== 'representative' || entry.path !== item.path) {
      errors.push(error(
        'MIGRATION_EVIDENCE_HASH_MISMATCH',
        `Migration evidence ${item.id} path/repository mismatch`,
        `evidence.${item.id}`,
      ));
      continue;
    }
    const absolute = join(representativeRoot, item.path);
    if (!existsSync(absolute)) {
      errors.push(error(
        'MIGRATION_EVIDENCE_HASH_MISMATCH',
        `Migration evidence file missing: ${item.path}`,
        `evidence.${item.id}`,
      ));
      continue;
    }
    const actual = sha256File(absolute);
    if (actual !== entry.sha256) {
      errors.push(error(
        'MIGRATION_EVIDENCE_HASH_MISMATCH',
        `Migration evidence ${item.id} hash does not match`,
        `evidence.${item.id}`,
      ));
    }
  }

  return errors;
}

function verifyCommerceFreeze(manifest, representativeRoot) {
  const errors = [];

  if (manifest.commerce?.newSalesEnabled !== false) {
    errors.push(error(
      'COMMERCE_SALES_ENABLED',
      'commerce.newSalesEnabled must be false for Slice 1',
      'commerce.newSalesEnabled',
    ));
  }

  const freezePath = join(
    representativeRoot,
    'docs',
    'release-manifests',
    'commerce-freeze-evidence.json',
  );
  if (!existsSync(freezePath)) {
    errors.push(error(
      'COMMERCE_PRODUCTION_FREEZE_PENDING',
      'commerce-freeze-evidence.json is missing',
      'commerce-freeze-evidence.json',
    ));
    return errors;
  }

  let freeze;
  try {
    freeze = JSON.parse(readFileSync(freezePath, 'utf8'));
  } catch {
    errors.push(error(
      'COMMERCE_PRODUCTION_FREEZE_PENDING',
      'commerce-freeze-evidence.json is not valid JSON',
      'commerce-freeze-evidence.json',
    ));
    return errors;
  }

  const status = freeze.productionFreezeStatus;
  const productionStatus = freeze.production?.status;
  const productionEvidencePath = freeze.production?.evidencePath
    ?? 'docs/release-manifests/evidence/slice-1/commerce-production.txt';
  const productionAbsolute = join(representativeRoot, productionEvidencePath);

  let freezeIncomplete = false;

  if (status !== 'complete') {
    freezeIncomplete = true;
    errors.push(error(
      'COMMERCE_PRODUCTION_FREEZE_PENDING',
      `production freeze status is pending/incomplete: ${String(status)}`,
      'commerce-freeze-evidence.json.productionFreezeStatus',
    ));
  }

  if (productionStatus !== 'EXECUTED') {
    freezeIncomplete = true;
    errors.push(error(
      'COMMERCE_PRODUCTION_FREEZE_PENDING',
      `production.status is pending/incomplete: ${String(productionStatus)}`,
      'commerce-freeze-evidence.json.production.status',
    ));
  }

  if (!existsSync(productionAbsolute)) {
    freezeIncomplete = true;
    errors.push(error(
      'COMMERCE_PRODUCTION_FREEZE_PENDING',
      `production freeze evidence file missing: ${productionEvidencePath}`,
      productionEvidencePath,
    ));
  }

  const requiredHashes = [
    'workerScriptHash',
    'webhookConfigHash',
    'kvNamespaceIdHash',
    'checkoutLinksDisabledHash',
    'healthProbeHash',
    'renewalVerifyHash',
    'portalVerifyHash',
    'quarantineVerifyHash',
  ];
  for (const key of requiredHashes) {
    if (freeze.production?.[key] == null) {
      freezeIncomplete = true;
      errors.push(error(
        'COMMERCE_PRODUCTION_FREEZE_PENDING',
        `production.${key} is null/missing`,
        `commerce-freeze-evidence.json.production.${key}`,
      ));
    }
  }

  if (
    freezeIncomplete
    && Array.isArray(manifest.completedSlices)
    && manifest.completedSlices.includes(1)
  ) {
    errors.push(error(
      'COMMERCE_PRODUCTION_FREEZE_PENDING',
      'completedSlices must not include 1 while production commerce freeze is incomplete',
      'completedSlices',
    ));
  }

  return errors;
}

/**
 * Verify Slice 1 cross-repository invariants.
 * @param {object} options
 * @returns {{ valid: boolean, errors: Array<{code: string, message: string, path?: string}> }}
 */
function verifyCrossRepoSlice(options) {
  const errors = [];
  const manifest = options.manifest;
  const repositories = options.repositories;
  if (!isObject(manifest)) {
    return { valid: false, errors: [error('SCHEMA_INVALID', 'Manifest must be an object')] };
  }
  if (!isObject(repositories)) {
    return { valid: false, errors: [error('SOURCE_VERIFICATION_FAILED', 'repositories adapters required')] };
  }

  const coreRoot = repositories.core.root;
  const representativeRoot = repositories.representative.root;
  const websiteRoot = repositories.website.root;

  errors.push(...verifySourcePins(manifest, repositories));
  errors.push(...verifyPublicClaims(coreRoot, websiteRoot));
  errors.push(...verifyReservationFixture(coreRoot, websiteRoot, representativeRoot));
  errors.push(...verifyLegalVersion(manifest, websiteRoot));
  errors.push(...verifyEvidenceHashes(manifest, repositories));
  errors.push(...verifyMigrationEvidence(manifest, representativeRoot));
  errors.push(...verifyCommerceFreeze(manifest, representativeRoot));

  return { valid: errors.length === 0, errors };
}

function printErrors(errors) {
  for (const violation of errors) {
    const suffix = violation.path ? ` (${violation.path})` : '';
    console.error(`${violation.code}: ${violation.message}${suffix}`);
  }
}

function runCli() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (cause) {
    console.error(`ARGUMENT_INVALID: ${cause.message}`);
    return 1;
  }

  const root = resolve(__dirname, '..');
  const parent = dirname(root);
  const manifestPath = resolve(String(args.manifest ?? join(root, 'release', 'release-manifest.json')));
  const repositoryPaths = {
    core: resolve(String(args['core-repo'] ?? root)),
    representative: resolve(String(
      args['representative-repo'] ?? join(parent, 'semblence-representative'),
    )),
    website: resolve(String(args['website-repo'] ?? join(parent, 'semblance-run'))),
  };

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (cause) {
    console.error(`RELEASE_MANIFEST_READ_FAILED: ${cause.message}`);
    return 1;
  }

  let repositories;
  try {
    repositories = Object.fromEntries(
      REPOSITORY_NAMES.map((name) => [name, gitRepositoryAdapter(repositoryPaths[name])]),
    );
  } catch (cause) {
    console.error(`SOURCE_VERIFICATION_FAILED: ${cause.message}`);
    return 1;
  }

  const result = verifyCrossRepoSlice({ manifest, repositories });
  printErrors(result.errors);
  if (result.valid) {
    console.log(`Cross-repo slice verified: ${manifest.releaseId}`);
    return 0;
  }
  console.error(`Cross-repo slice verification failed with ${result.errors.length} error(s)`);
  return 1;
}

module.exports = {
  verifyCrossRepoSlice,
  MIGRATION_EVIDENCE_IDS,
};

if (require.main === module) {
  process.exitCode = runCli();
}
