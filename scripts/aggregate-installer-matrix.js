#!/usr/bin/env node
'use strict';

/**
 * Aggregate three VM installer results into installer-matrix.v1.json field evidence.
 *
 * Usage:
 *   node scripts/aggregate-installer-matrix.js \
 *     --vm-a /path/vm-a.json \
 *     --vm-b /path/vm-b.json \
 *     --vm-c /path/vm-c.json \
 *     [--out release/evidence/field/installer-matrix.v1.json]
 *
 * Exit: 0 matrixPass evidence written, 1 failure
 */

const { readFileSync, existsSync, mkdirSync, writeFileSync } = require('node:fs');
const { join, resolve, dirname } = require('node:path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const ROOT = resolve(__dirname, '..');
const DEFAULT_OUT = join(ROOT, 'release', 'evidence', 'field', 'installer-matrix.v1.json');
const MANIFEST_PATH = join(ROOT, 'release', 'release-manifest.json');
const SCHEMA_PATH = join(ROOT, 'release', 'evidence', 'schemas', 'installer-matrix.v1.schema.json');

function readArg(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return fallback;
  return process.argv[idx + 1];
}

function printUsage() {
  console.log(`Usage: node scripts/aggregate-installer-matrix.js \\
  --vm-a <json> --vm-b <json> --vm-c <json> [--out <path>]

Aggregates per-VM capture-installer-vm.js results. matrixPass is true only when all
three VMs report installPass, updatePass, rollbackPass, and uninstallPass true.`);
}

function loadReleaseId() {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')).releaseId;
}

function loadVmResult(path, label) {
  if (!path || !existsSync(path)) {
    throw new Error(`${label} result missing: ${path}`);
  }
  const data = JSON.parse(readFileSync(path, 'utf8'));
  const required = ['vmId', 'installPass', 'updatePass', 'rollbackPass', 'uninstallPass'];
  for (const key of required) {
    if (typeof data[key] === 'undefined') {
      throw new Error(`${label} result missing field ${key}`);
    }
  }
  return data;
}

function vmLifecyclePass(vm) {
  return vm.installPass && vm.updatePass && vm.rollbackPass && vm.uninstallPass;
}

function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    return 0;
  }

  const vmAPath = readArg('--vm-a');
  const vmBPath = readArg('--vm-b');
  const vmCPath = readArg('--vm-c');
  const outPath = resolve(readArg('--out', DEFAULT_OUT));

  if (!vmAPath || !vmBPath || !vmCPath) {
    console.error('Missing --vm-a, --vm-b, or --vm-c');
    printUsage();
    return 1;
  }

  let vms;
  try {
    vms = [
      loadVmResult(resolve(vmAPath), 'vm-a'),
      loadVmResult(resolve(vmBPath), 'vm-b'),
      loadVmResult(resolve(vmCPath), 'vm-c'),
    ];
  } catch (cause) {
    console.error(cause.message);
    return 1;
  }

  const matrixPass = vms.every(vmLifecyclePass);
  if (!matrixPass) {
    console.error('Not all VMs passed full install lifecycle — refusing matrixPass:true evidence');
    for (const vm of vms) {
      console.error(`  ${vm.vmId}: install=${vm.installPass} update=${vm.updatePass} rollback=${vm.rollbackPass} uninstall=${vm.uninstallPass}`);
    }
    return 1;
  }

  const evidence = {
    schemaVersion: 1,
    evidenceId: 'installer-three-vms',
    capturedAt: new Date().toISOString(),
    releaseId: loadReleaseId(),
    matrixPass: true,
    vms: vms.map((vm) => ({
      vmId: vm.vmId,
      installPass: vm.installPass,
      updatePass: vm.updatePass,
      rollbackPass: vm.rollbackPass,
      uninstallPass: vm.uninstallPass,
      installerPath: vm.installerPath,
      notes: vm.notes,
    })),
    notes: 'Aggregated by scripts/aggregate-installer-matrix.js from three VM capture runs',
  };

  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')));
  if (!validate(evidence)) {
    console.error('Schema validation failed:', validate.errors);
    return 1;
  }

  const semantic = require('./verify-field-evidence.js').semanticChecks('installer-matrix', evidence);
  if (semantic.length > 0) {
    console.error(`Semantic checks failed: ${semantic.join('; ')}`);
    return 1;
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(`Wrote installer matrix evidence: ${outPath}`);
  return 0;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = { vmLifecyclePass, loadVmResult };
