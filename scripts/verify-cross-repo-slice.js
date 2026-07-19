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
const OPTIONAL_REPOSITORY_NAMES = ['semblanceNode'];
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
    'manifest', 'core-repo', 'representative-repo', 'website-repo', 'node-repo',
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

function verifyOptionalSourcePins(manifest, repositories) {
  const errors = [];
  for (const name of OPTIONAL_REPOSITORY_NAMES) {
    const source = manifest.repositories?.[name];
    const repository = repositories[name];
    if (!isObject(source)) continue;
    if (!repository) {
      errors.push(error(
        'SOURCE_VERIFICATION_FAILED',
        `${name} repository adapter missing for pinned manifest entry`,
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
      if (typeof source.repositoryUrl === 'string' && source.repositoryUrl.length === 0) {
        errors.push(error(
          'SOURCE_VERIFICATION_FAILED',
          `${name} repositoryUrl must be a non-empty string`,
          `repositories.${name}.repositoryUrl`,
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

function verifySlice8Completion(manifest, coreRoot) {
  const errors = [];
  const slice8Complete = Array.isArray(manifest.completedSlices)
    && manifest.completedSlices.includes(8);
  const slice9Complete = Array.isArray(manifest.completedSlices)
    && manifest.completedSlices.includes(9);
  if (!slice8Complete) {
    return errors;
  }

  if (!slice9Complete && manifest.releaseId !== 'byo-self-hosted-execution-2026-07-18') {
    errors.push(error(
      'SLICE_8_RELEASE_ID_MISMATCH',
      'releaseId must be byo-self-hosted-execution-2026-07-18 when Slice 8 is complete',
      'releaseId',
    ));
  }

  if (!isObject(manifest.repositories?.semblanceNode)) {
    errors.push(error(
      'SLICE_8_NODE_PIN_MISSING',
      'repositories.semblanceNode must be pinned when Slice 8 is complete',
      'repositories.semblanceNode',
    ));
  }

  const requiredEvidenceIds = [
    'slice-8-exit-gate',
    'slice-8-exit-gate-tests',
    'slice-8-kernel-execution-policy',
    'slice-8-cloud-broker-tests',
    'slice-8-protocol-execution-v1',
    'slice-8-semblance-node-conformance',
  ];

  for (const evidenceId of requiredEvidenceIds) {
    const entry = (manifest.evidence ?? []).find((item) => item.id === evidenceId);
    if (!entry) {
      errors.push(error(
        'SLICE_8_EVIDENCE_MISSING',
        `Slice 8 evidence entry missing: ${evidenceId}`,
        `evidence.${evidenceId}`,
      ));
      continue;
    }
    const absolute = join(coreRoot, entry.path);
    if (!existsSync(absolute)) {
      errors.push(error(
        'SLICE_8_EVIDENCE_MISSING',
        `Slice 8 evidence file missing: ${entry.path}`,
        entry.path,
      ));
    } else if (sha256File(absolute) !== entry.sha256) {
      errors.push(error(
        'SLICE_8_EVIDENCE_HASH_MISMATCH',
        `Slice 8 evidence ${evidenceId} hash does not match manifest`,
        `evidence.${evidenceId}`,
      ));
    }
  }

  return errors;
}

function verifySlice9Completion(manifest, coreRoot) {
  const errors = [];
  const slice9Complete = Array.isArray(manifest.completedSlices)
    && manifest.completedSlices.includes(9);
  if (!slice9Complete) {
    return errors;
  }

  const slice10Complete = Array.isArray(manifest.completedSlices)
    && manifest.completedSlices.includes(10);

  if (!slice10Complete && manifest.releaseId !== 'attested-confidential-compute-2026-07-19') {
    errors.push(error(
      'SLICE_9_RELEASE_ID_MISMATCH',
      'releaseId must be attested-confidential-compute-2026-07-19 when Slice 9 is complete',
      'releaseId',
    ));
  }

  const requiredEvidenceIds = [
    'slice-9-exit-gate',
    'slice-9-exit-gate-tests',
    'slice-9-proof-receipt-tests',
    'slice-9-cloud-budget-tests',
    'slice-9-confidential-broker-tests',
  ];

  for (const evidenceId of requiredEvidenceIds) {
    const entry = (manifest.evidence ?? []).find((item) => item.id === evidenceId);
    if (!entry) {
      errors.push(error(
        'SLICE_9_EVIDENCE_MISSING',
        `Slice 9 evidence entry missing: ${evidenceId}`,
        `evidence.${evidenceId}`,
      ));
      continue;
    }
    const absolute = join(coreRoot, entry.path);
    if (!existsSync(absolute)) {
      errors.push(error(
        'SLICE_9_EVIDENCE_MISSING',
        `Slice 9 evidence file missing: ${entry.path}`,
        entry.path,
      ));
    } else if (sha256File(absolute) !== entry.sha256) {
      errors.push(error(
        'SLICE_9_EVIDENCE_HASH_MISMATCH',
        `Slice 9 evidence ${evidenceId} hash does not match manifest`,
        `evidence.${evidenceId}`,
      ));
    }
  }

  return errors;
}

function verifySlice10Completion(manifest, coreRoot) {
  const errors = [];
  const slice10Complete = Array.isArray(manifest.completedSlices)
    && manifest.completedSlices.includes(10);
  if (!slice10Complete) {
    return errors;
  }

  const slice11Complete = Array.isArray(manifest.completedSlices)
    && manifest.completedSlices.includes(11);

  if (!slice11Complete && manifest.releaseId !== 'today-proactive-agency-2026-07-19') {
    errors.push(error(
      'SLICE_10_RELEASE_ID_MISMATCH',
      'releaseId must be today-proactive-agency-2026-07-19 when Slice 10 is complete',
      'releaseId',
    ));
  }

  const requiredEvidenceIds = [
    'slice-10-exit-gate',
    'slice-10-exit-gate-tests',
    'slice-10-proof-center-tests',
    'slice-10-today-snapshot-tests',
  ];

  for (const evidenceId of requiredEvidenceIds) {
    const entry = (manifest.evidence ?? []).find((item) => item.id === evidenceId);
    if (!entry) {
      errors.push(error(
        'SLICE_10_EVIDENCE_MISSING',
        `Slice 10 evidence entry missing: ${evidenceId}`,
        `evidence.${evidenceId}`,
      ));
      continue;
    }
    const absolute = join(coreRoot, entry.path);
    if (!existsSync(absolute)) {
      errors.push(error(
        'SLICE_10_EVIDENCE_MISSING',
        `Slice 10 evidence file missing: ${entry.path}`,
        entry.path,
      ));
    } else if (sha256File(absolute) !== entry.sha256) {
      errors.push(error(
        'SLICE_10_EVIDENCE_HASH_MISMATCH',
        `Slice 10 evidence ${evidenceId} hash does not match manifest`,
        `evidence.${evidenceId}`,
      ));
    }
  }

  return errors;
}

function verifySlice11Completion(manifest, coreRoot) {
  const errors = [];
  const slice11Complete = Array.isArray(manifest.completedSlices)
    && manifest.completedSlices.includes(11);
  if (!slice11Complete) {
    return errors;
  }

  if (manifest.releaseId !== 'mobile-sync-mesh-2026-07-19') {
    errors.push(error(
      'SLICE_11_RELEASE_ID_MISMATCH',
      'releaseId must be mobile-sync-mesh-2026-07-19 when Slice 11 is complete',
      'releaseId',
    ));
  }

  const requiredEvidenceIds = [
    'slice-11-exit-gate',
    'slice-11-exit-gate-tests',
    'slice-11-sync-revocation-tests',
    'slice-11-compute-mesh-tests',
  ];

  for (const evidenceId of requiredEvidenceIds) {
    const entry = (manifest.evidence ?? []).find((item) => item.id === evidenceId);
    if (!entry) {
      errors.push(error(
        'SLICE_11_EVIDENCE_MISSING',
        `Slice 11 evidence entry missing: ${evidenceId}`,
        `evidence.${evidenceId}`,
      ));
      continue;
    }
    const absolute = join(coreRoot, entry.path);
    if (!existsSync(absolute)) {
      errors.push(error(
        'SLICE_11_EVIDENCE_MISSING',
        `Slice 11 evidence file missing: ${entry.path}`,
        entry.path,
      ));
    } else if (sha256File(absolute) !== entry.sha256) {
      errors.push(error(
        'SLICE_11_EVIDENCE_HASH_MISMATCH',
        `Slice 11 evidence ${evidenceId} hash does not match manifest`,
        `evidence.${evidenceId}`,
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

function verifyPublicClaimsSalesFlag(manifest, coreRoot) {
  const errors = [];
  const claimsPath = join(coreRoot, 'release', 'public-claims.v1.json');
  if (!existsSync(claimsPath)) {
    errors.push(error(
      'PUBLIC_CLAIMS_SALES_MISMATCH',
      'release/public-claims.v1.json missing for sales-flag coherence check',
      'public-claims.v1.json',
    ));
    return errors;
  }
  let claims;
  try {
    claims = JSON.parse(readFileSync(claimsPath, 'utf8'));
  } catch {
    errors.push(error(
      'PUBLIC_CLAIMS_SALES_MISMATCH',
      'release/public-claims.v1.json is not valid JSON',
      'public-claims.v1.json',
    ));
    return errors;
  }
  const claimsEnabled = claims?.salesFreeze?.newSalesEnabled === true;
  const manifestEnabled = manifest?.commerce?.newSalesEnabled === true;
  if (claimsEnabled !== manifestEnabled) {
    errors.push(error(
      'PUBLIC_CLAIMS_SALES_MISMATCH',
      `public-claims salesFreeze.newSalesEnabled (${claimsEnabled}) must match commerce.newSalesEnabled (${manifestEnabled})`,
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

function verifyCommerceFreeze(manifest, representativeRoot, coreRoot) {
  const errors = [];
  const slice7Complete = Array.isArray(manifest.completedSlices)
    && manifest.completedSlices.includes(7);
  const salesEnabledEvidence = (manifest.evidence ?? []).find(
    (entry) => entry.id === 'slice-7-new-sales-enabled',
  );

  if (slice7Complete && salesEnabledEvidence) {
    if (manifest.commerce?.newSalesEnabled !== true) {
      errors.push(error(
        'COMMERCE_SALES_DISABLED',
        'commerce.newSalesEnabled must be true when Slice 7 is complete',
        'commerce.newSalesEnabled',
      ));
    }

    const salesEvidenceAbsolute = join(coreRoot, salesEnabledEvidence.path);
    if (!existsSync(salesEvidenceAbsolute)) {
      errors.push(error(
        'COMMERCE_SALES_EVIDENCE_MISSING',
        `Slice 7 sales evidence missing: ${salesEnabledEvidence.path}`,
        salesEnabledEvidence.path,
      ));
    } else if (sha256File(salesEvidenceAbsolute) !== salesEnabledEvidence.sha256) {
      errors.push(error(
        'COMMERCE_SALES_EVIDENCE_HASH_MISMATCH',
        'Slice 7 sales evidence hash does not match manifest',
        `evidence.${salesEnabledEvidence.id}`,
      ));
    }

    const exitGateEvidence = (manifest.evidence ?? []).find(
      (entry) => entry.id === 'slice-7-exit-gate',
    );
    if (exitGateEvidence) {
      const exitGateAbsolute = join(coreRoot, exitGateEvidence.path);
      if (!existsSync(exitGateAbsolute)) {
        errors.push(error(
          'SLICE_7_EXIT_GATE_MISSING',
          `Slice 7 exit gate evidence missing: ${exitGateEvidence.path}`,
          exitGateEvidence.path,
        ));
      } else if (sha256File(exitGateAbsolute) !== exitGateEvidence.sha256) {
        errors.push(error(
          'SLICE_7_EXIT_GATE_HASH_MISMATCH',
          'Slice 7 exit gate evidence hash does not match manifest',
          `evidence.${exitGateEvidence.id}`,
        ));
      }
    }

    return errors;
  }

  if (manifest.commerce?.newSalesEnabled !== false) {
    errors.push(error(
      'COMMERCE_SALES_ENABLED',
      'commerce.newSalesEnabled must be false before Slice 7 sales evidence is pinned',
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
  errors.push(...verifyOptionalSourcePins(manifest, repositories));
  errors.push(...verifyPublicClaims(coreRoot, websiteRoot));
  errors.push(...verifyPublicClaimsSalesFlag(manifest, coreRoot));
  errors.push(...verifyReservationFixture(coreRoot, websiteRoot, representativeRoot));
  errors.push(...verifyLegalVersion(manifest, websiteRoot));
  errors.push(...verifyEvidenceHashes(manifest, repositories));
  errors.push(...verifyMigrationEvidence(manifest, representativeRoot));
  errors.push(...verifyCommerceFreeze(manifest, representativeRoot, coreRoot));
  errors.push(...verifySlice8Completion(manifest, coreRoot));
  errors.push(...verifySlice9Completion(manifest, coreRoot));
  errors.push(...verifySlice10Completion(manifest, coreRoot));
  errors.push(...verifySlice11Completion(manifest, coreRoot));

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
    semblanceNode: resolve(String(
      args['node-repo'] ?? join(parent, 'semblance-node'),
    )),
  };

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (cause) {
    console.error(`RELEASE_MANIFEST_READ_FAILED: ${cause.message}`);
    return 1;
  }

  const repositoryNames = [...REPOSITORY_NAMES];
  if (isObject(manifest.repositories?.semblanceNode)) {
    repositoryNames.push('semblanceNode');
  }

  let repositories;
  try {
    repositories = Object.fromEntries(
      repositoryNames.map((name) => [name, gitRepositoryAdapter(repositoryPaths[name])]),
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
  verifySlice9Completion,
  verifySlice10Completion,
  verifySlice11Completion,
};

if (require.main === module) {
  process.exitCode = runCli();
}
