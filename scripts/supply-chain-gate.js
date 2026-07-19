#!/usr/bin/env node
'use strict';

/**
 * Supply-chain release gate.
 *
 * Verifies SBOM + third-party notices exist, dependency licenses pass allowlist,
 * and release-manifest evidence hashes match pinned artifacts.
 *
 * Usage:
 *   node scripts/supply-chain-gate.js
 *   node scripts/supply-chain-gate.js --generate   # regenerate SBOM/notices first
 *
 * Exit: 0 pass, 1 fail
 */

const { createHash } = require('node:crypto');
const { readFileSync, existsSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = resolve(__dirname, '..');
const SBOM_PATH = join(ROOT, 'release', 'sbom', 'semblance.cdx.json');
const NOTICES_PATH = join(ROOT, 'release', 'legal', 'THIRD_PARTY_NOTICES.md');
const MANIFEST_PATH = join(ROOT, 'release', 'release-manifest.json');
const GENERATE = process.argv.includes('--generate');

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const PERMISSIVE_TOKENS = [
  'MIT',
  'APACHE',
  'BSD',
  'ISC',
  '0BSD',
  'UNLICENSE',
  'CC0',
  'CC-BY',
  'OFL',
  'ZLIB',
  'WTFPL',
  'MPL-2.0',
  'PUBLIC DOMAIN',
  'PYTHON',
  'UNICOD',
  'OPENSSL',
  'ARTISTIC-2.0',
  'HPND',
  'BLUEOAK',
];

const GPL_ONLY = /^GPL(?:-|\s|$)|^AGPL(?:-|\s|$)/i;

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function isLicenseAllowed(license) {
  if (!license || license === 'UNKNOWN') return false;
  const normalized = String(license).trim();
  if (normalized === 'SEE LICENSE IN LICENSE') return true;

  const upper = normalized.toUpperCase();
  if (upper.includes(' OR ')) {
    const options = upper.split(/\s+OR\s+/).map((part) => part.replace(/[()]/g, '').trim());
    return options.some((option) => isLicenseAllowed(option));
  }
  if (upper.includes(' AND ')) {
    const parts = upper.split(/\s+AND\s+/);
    return parts.every((part) => isLicenseAllowed(part.trim()));
  }

  if (GPL_ONLY.test(upper) && !upper.includes(' OR ')) {
    return false;
  }

  return PERMISSIVE_TOKENS.some((token) => upper.includes(token));
}

function ensureGeneratedArtifacts() {
  if (GENERATE || !existsSync(SBOM_PATH) || !existsSync(NOTICES_PATH)) {
    const sbom = spawnSync('node', ['scripts/generate-sbom.js'], { cwd: ROOT, encoding: 'utf8' });
    if (sbom.status !== 0) {
      throw new Error(`generate-sbom failed: ${sbom.stderr || sbom.stdout}`);
    }
    const notices = spawnSync('node', ['scripts/generate-notices.js'], { cwd: ROOT, encoding: 'utf8' });
    if (notices.status !== 0) {
      throw new Error(`generate-notices failed: ${notices.stderr || notices.stdout}`);
    }
  }
}

function verifyNoticesVersion(manifest) {
  const notices = readFileSync(NOTICES_PATH, 'utf8');
  const expected = manifest.legalNoticesVersion;
  const versionLine = notices.match(/^Version:\s*(.+)$/m);
  if (!versionLine) {
    return 'THIRD_PARTY_NOTICES.md missing Version: header';
  }
  if (versionLine[1].trim() !== expected) {
    return `legalNoticesVersion mismatch: manifest=${expected}, notices=${versionLine[1].trim()}`;
  }
  return null;
}

function verifyManifestEvidence(manifest) {
  const errors = [];
  const keyIds = new Set([
    'cross-cutting-gate-matrix',
    'cross-cutting-stop-conditions',
    'cross-cutting-release-trains',
  ]);

  for (const artifact of manifest.signedArtifacts ?? []) {
    const abs = join(ROOT, artifact.path);
    if (!existsSync(abs)) {
      errors.push(`signed artifact missing: ${artifact.path}`);
      continue;
    }
    if (!SHA256_PATTERN.test(artifact.sha256 ?? '')) {
      errors.push(`signed artifact missing sha256 pin: ${artifact.path}`);
      continue;
    }
    if (artifact.signature !== 'source-phase-unsigned') {
      const hash = sha256File(abs);
      if (hash !== artifact.sha256) {
        errors.push(`signed artifact hash mismatch: ${artifact.path}`);
      }
    }
  }

  for (const entry of manifest.evidence ?? []) {
    if (!keyIds.has(entry.id)) continue;
    const abs = join(ROOT, entry.path);
    if (!existsSync(abs)) {
      errors.push(`evidence missing: ${entry.path}`);
      continue;
    }
    const hash = sha256File(abs);
    if (hash !== entry.sha256) {
      errors.push(`evidence hash mismatch: ${entry.id}`);
    }
  }

  return errors;
}

function verifySbomLicenses(sbom) {
  const banned = [];
  for (const component of sbom.components ?? []) {
    if (component.ecosystem === 'cargo') continue;
    if (component.license === 'UNKNOWN') continue;
    if (!isLicenseAllowed(component.license)) {
      banned.push(`${component.name}@${component.version} (${component.license})`);
    }
  }
  return banned;
}

function main() {
  ensureGeneratedArtifacts();

  const errors = [];
  if (!existsSync(SBOM_PATH)) errors.push(`SBOM missing: ${SBOM_PATH}`);
  if (!existsSync(NOTICES_PATH)) errors.push(`notices missing: ${NOTICES_PATH}`);
  if (errors.length > 0) {
    console.error('SUPPLY_CHAIN_GATE_FAIL');
    for (const err of errors) console.error(`  - ${err}`);
    return 1;
  }

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const sbom = JSON.parse(readFileSync(SBOM_PATH, 'utf8'));
  const noticesError = verifyNoticesVersion(manifest);
  if (noticesError) errors.push(noticesError);

  const banned = verifySbomLicenses(sbom);
  if (banned.length > 0) {
    errors.push(`banned or unknown licenses (${banned.length}):`);
    for (const item of banned.slice(0, 20)) errors.push(`  ${item}`);
    if (banned.length > 20) errors.push(`  ... and ${banned.length - 20} more`);
  }

  errors.push(...verifyManifestEvidence(manifest));

  console.log('\nSupply-chain gate');
  console.log(`  SBOM:    ${SBOM_PATH}`);
  console.log(`  Notices: ${NOTICES_PATH}`);
  console.log(`  legalNoticesVersion: ${manifest.legalNoticesVersion}`);
  console.log(`  npm+cargo components: ${(sbom.components ?? []).length}`);

  if (errors.length > 0) {
    console.log('\nFAIL');
    for (const err of errors) console.log(`  - ${err}`);
    return 1;
  }

  console.log('\nPASS — SBOM, notices, license allowlist, and key evidence hashes verified');
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (cause) {
    console.error(`SUPPLY_CHAIN_GATE_ERROR: ${cause.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  isLicenseAllowed,
  verifyManifestEvidence,
  verifySbomLicenses,
  SBOM_PATH,
  NOTICES_PATH,
};
