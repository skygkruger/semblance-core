#!/usr/bin/env node
'use strict';

/**
 * FeatureEvidence ladder enforcement for release-manifest.json features.
 *
 * Validates PascalCase states, evidenceId resolution, and monotonicity notes.
 * Fails on unknown states or dangling evidence references.
 *
 * Usage:
 *   node scripts/check-feature-evidence-ladder.js
 *   node scripts/check-feature-evidence-ladder.js --manifest release/release-manifest.json
 */

const { readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');

const VALID_STATES = [
  'Specified',
  'Implemented',
  'Wired',
  'DataVerified',
  'RuntimeVerified',
  'AdversariallyVerified',
  'Released',
  'FieldProven',
];

const STATE_RANK = Object.fromEntries(VALID_STATES.map((state, index) => [state, index]));

function parseArgs(argv) {
  let manifestPath = join(__dirname, '..', 'release', 'release-manifest.json');
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--manifest') {
      manifestPath = resolve(argv[index + 1] ?? '');
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return manifestPath;
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {object} manifest
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function checkFeatureEvidenceLadder(manifest) {
  const errors = [];
  const warnings = [];

  if (!Array.isArray(manifest.features)) {
    errors.push('manifest.features must be an array');
    return { valid: false, errors, warnings };
  }

  const evidenceIds = new Set((manifest.evidence ?? []).map((entry) => entry.id));

  for (const feature of manifest.features) {
    if (!isObject(feature)) {
      errors.push('feature entry must be an object');
      continue;
    }

    if (!VALID_STATES.includes(feature.state)) {
      errors.push(`feature ${feature.id}: unknown state "${feature.state}"`);
    }

    if (!Array.isArray(feature.evidenceIds)) {
      errors.push(`feature ${feature.id}: evidenceIds must be an array`);
      continue;
    }

    for (const evidenceId of feature.evidenceIds) {
      if (!evidenceIds.has(evidenceId)) {
        errors.push(`feature ${feature.id}: evidenceId "${evidenceId}" not found in manifest.evidence`);
      }
    }

    if (typeof feature.legalNoticesVersion === 'string'
      && typeof manifest.legalNoticesVersion === 'string'
      && feature.legalNoticesVersion !== manifest.legalNoticesVersion) {
      errors.push(
        `feature ${feature.id}: legalNoticesVersion "${feature.legalNoticesVersion}" `
        + `does not match manifest "${manifest.legalNoticesVersion}"`,
      );
    }

    const rank = STATE_RANK[feature.state];
    if (rank >= STATE_RANK.Released) {
      warnings.push(
        `feature ${feature.id}: state ${feature.state} requires FieldProven hardware/installer gates `
        + 'before broad public claims — verify cross-cutting matrix deferred gates',
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function main() {
  const manifestPath = parseArgs(process.argv);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (cause) {
    console.error(`LADDER_READ_FAILED: ${cause.message}`);
    return 1;
  }

  const result = checkFeatureEvidenceLadder(manifest);
  console.log('Feature evidence ladder');
  console.log('─'.repeat(60));
  console.log(`  Features checked: ${manifest.features?.length ?? 0}`);
  console.log(`  Valid states: ${VALID_STATES.join(', ')}`);

  for (const warning of result.warnings) {
    console.log(`  NOTE  ${warning}`);
  }

  if (result.valid) {
    console.log('  PASS  ladder validation');
    console.log('─'.repeat(60));
    return 0;
  }

  for (const error of result.errors) {
    console.error(`  FAIL  ${error}`);
  }
  console.error('─'.repeat(60));
  console.error(`Feature evidence ladder: FAIL (${result.errors.length} error(s))`);
  return 1;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  checkFeatureEvidenceLadder,
  VALID_STATES,
  STATE_RANK,
};
