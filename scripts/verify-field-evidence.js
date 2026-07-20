#!/usr/bin/env node
'use strict';

/**
 * Field evidence verifier for hardware-only gates.
 *
 * Modes:
 *   --launch-floor         Windows 11 launch-floor benchmark evidence
 *   --installer-matrix     Three clean VM installer matrix evidence
 *   --mobile-acceptance    Physical mobile device acceptance evidence
 *
 * Exit codes:
 *   0 — evidence present and valid (PASS)
 *   1 — evidence present but invalid, or verifier error (FAIL)
 *   2 — evidence file missing (DeferredFieldProof — not a matrix failure)
 *
 * Usage:
 *   node scripts/verify-field-evidence.js --launch-floor
 */

const { readFileSync, existsSync } = require('node:fs');
const { join, resolve } = require('node:path');
const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const ROOT = resolve(__dirname, '..');
const EVIDENCE_DIR = join(ROOT, 'release', 'evidence', 'field');
const SCHEMA_DIR = join(ROOT, 'release', 'evidence', 'schemas');

/** @typedef {'launch-floor' | 'installer-matrix' | 'mobile-acceptance'} FieldMode */

/** @type {Record<FieldMode, { evidenceFile: string, schemaFile: string, gateId: string }>} */
const MODES = {
  'launch-floor': {
    evidenceFile: join(EVIDENCE_DIR, 'launch-floor.v1.json'),
    schemaFile: join(SCHEMA_DIR, 'launch-floor.v1.schema.json'),
    gateId: 'performance-launch-floor',
  },
  'installer-matrix': {
    evidenceFile: join(EVIDENCE_DIR, 'installer-matrix.v1.json'),
    schemaFile: join(SCHEMA_DIR, 'installer-matrix.v1.schema.json'),
    gateId: 'installer-three-vms',
  },
  'mobile-acceptance': {
    evidenceFile: join(EVIDENCE_DIR, 'mobile-acceptance.v1.json'),
    schemaFile: join(SCHEMA_DIR, 'mobile-acceptance.v1.schema.json'),
    gateId: 'mobile-device-acceptance',
  },
};

const EXIT = {
  PASS: 0,
  FAIL: 1,
  DEFERRED: 2,
};

function parseMode(argv) {
  if (argv.includes('--launch-floor')) return 'launch-floor';
  if (argv.includes('--installer-matrix')) return 'installer-matrix';
  if (argv.includes('--mobile-acceptance')) return 'mobile-acceptance';
  return null;
}

function loadValidator(schemaPath) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  return ajv.compile(schema);
}

function semanticChecks(mode, data) {
  const errors = [];
  if (mode === 'launch-floor') {
    if (data.pass !== true) errors.push('launch-floor evidence pass must be true');
    if (data.readySeconds > 90) errors.push(`readySeconds ${data.readySeconds} exceeds 90s launch floor`);
  }
  if (mode === 'installer-matrix') {
    if (data.matrixPass !== true) errors.push('installer matrixPass must be true');
    for (const vm of data.vms ?? []) {
      if (!vm.installPass || !vm.updatePass || !vm.rollbackPass || !vm.uninstallPass) {
        errors.push(`VM ${vm.vmId} did not pass full install lifecycle`);
      }
    }
  }
  if (mode === 'mobile-acceptance') {
    if (data.pass !== true) errors.push('mobile acceptance pass must be true');
    const platforms = new Set((data.devices ?? []).map((d) => d.platform));
    if (!platforms.has('ios')) {
      errors.push('MOBILE_DEVICE_ACCEPTANCE.md requires at least one physical iOS device');
    }
    if (!platforms.has('android')) {
      errors.push('MOBILE_DEVICE_ACCEPTANCE.md requires at least one physical Android device');
    }
    for (const device of data.devices ?? []) {
      const checks = device.checks ?? {};
      for (const key of ['localInference', 'sync', 'routing', 'proofOffline']) {
        if (checks[key] !== true) {
          errors.push(`${device.platform}/${device.model}: ${key} not true`);
        }
      }
    }
  }
  return errors;
}

function verifyMode(mode) {
  const config = MODES[mode];
  if (!existsSync(config.evidenceFile)) {
    return {
      status: 'DeferredFieldProof',
      exitCode: EXIT.DEFERRED,
      message: `Evidence file missing: ${config.evidenceFile}`,
      gateId: config.gateId,
    };
  }

  let data;
  try {
    data = JSON.parse(readFileSync(config.evidenceFile, 'utf8'));
  } catch (cause) {
    return {
      status: 'fail',
      exitCode: EXIT.FAIL,
      message: `Invalid JSON in evidence file: ${cause.message}`,
      gateId: config.gateId,
    };
  }

  const validate = loadValidator(config.schemaFile);
  if (!validate(data)) {
    const details = (validate.errors ?? []).map(
      (err) => `${err.instancePath || '/'} ${err.message}`,
    ).join('; ');
    return {
      status: 'fail',
      exitCode: EXIT.FAIL,
      message: `Schema validation failed: ${details}`,
      gateId: config.gateId,
    };
  }

  const semantic = semanticChecks(mode, data);
  if (semantic.length > 0) {
    return {
      status: 'fail',
      exitCode: EXIT.FAIL,
      message: semantic.join('; '),
      gateId: config.gateId,
    };
  }

  return {
    status: 'pass',
    exitCode: EXIT.PASS,
    message: `Valid field evidence for ${config.gateId}`,
    gateId: config.gateId,
    evidenceFile: config.evidenceFile,
  };
}

function main() {
  const mode = parseMode(process.argv.slice(2));
  if (!mode) {
    console.error('Usage: node scripts/verify-field-evidence.js --launch-floor|--installer-matrix|--mobile-acceptance');
    return EXIT.FAIL;
  }

  const result = verifyMode(mode);
  console.log(`Field evidence verifier (${mode})`);
  console.log(`  gate:   ${result.gateId}`);
  console.log(`  status: ${result.status}`);
  console.log(`  detail: ${result.message}`);
  if (result.evidenceFile) console.log(`  file:   ${result.evidenceFile}`);

  return result.exitCode;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  MODES,
  EXIT,
  verifyMode,
  semanticChecks,
};
