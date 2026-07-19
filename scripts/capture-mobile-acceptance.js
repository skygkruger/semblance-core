#!/usr/bin/env node
'use strict';

/**
 * Capture mobile physical device acceptance field evidence.
 *
 * Does NOT invent device results. Use --from-checklist with operator-recorded JSON,
 * or interactive mode to enter checks after running the protocol on real hardware.
 *
 * Usage:
 *   node scripts/capture-mobile-acceptance.js --interactive [--out <path>]
 *   node scripts/capture-mobile-acceptance.js --from-checklist checklist.json [--out <path>]
 *   cat checklist.json | node scripts/capture-mobile-acceptance.js --from-checklist -
 *
 * Protocol reference: semblence-representative/docs/MOBILE_DEVICE_ACCEPTANCE.md
 *
 * Exit: 0 evidence written, 1 validation/capture failure, 2 deferred guidance only
 */

const { createInterface } = require('node:readline');
const { readFileSync, existsSync, mkdirSync, writeFileSync } = require('node:fs');
const { join, resolve, dirname } = require('node:path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const ROOT = resolve(__dirname, '..');
const DEFAULT_OUT = join(ROOT, 'release', 'evidence', 'field', 'mobile-acceptance.v1.json');
const MANIFEST_PATH = join(ROOT, 'release', 'release-manifest.json');
const SCHEMA_PATH = join(ROOT, 'release', 'evidence', 'schemas', 'mobile-acceptance.v1.schema.json');
const PROTOCOL_PATH = join(ROOT, '..', 'semblence-representative', 'docs', 'MOBILE_DEVICE_ACCEPTANCE.md');

const CHECK_KEYS = ['localInference', 'sync', 'routing', 'proofOffline'];

function readArg(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return fallback;
  return process.argv[idx + 1];
}

function printUsage() {
  console.log(`Usage:
  node scripts/capture-mobile-acceptance.js --interactive [--out <path>]
  node scripts/capture-mobile-acceptance.js --from-checklist <file|-> [--out <path>]

Writes release/evidence/field/mobile-acceptance.v1.json only when pass:true and every
device check is true. Simulators/emulators do not satisfy FieldProven acceptance.

Protocol: semblence-representative/docs/MOBILE_DEVICE_ACCEPTANCE.md`);
}

function printProtocol() {
  console.log('\n=== Mobile Device Acceptance Protocol ===');
  if (existsSync(PROTOCOL_PATH)) {
    console.log(`Reference: ${PROTOCOL_PATH}\n`);
    const content = readFileSync(PROTOCOL_PATH, 'utf8');
    const sections = [
      '## Required hardware',
      '## Preconditions',
      '## Acceptance protocol',
      '### 1. Local inference',
      '### 2. Sync',
      '### 3. Routing',
      '### 4. Proof offline',
    ];
    for (const heading of sections) {
      const idx = content.indexOf(heading);
      if (idx === -1) continue;
      const next = sections.map((h) => content.indexOf(h, idx + heading.length)).filter((n) => n > idx);
      const end = next.length ? Math.min(...next) : content.length;
      console.log(content.slice(idx, end).trim());
      console.log('');
    }
  } else {
    console.log(`Protocol file not found at ${PROTOCOL_PATH}`);
    console.log('Complete checks per MOBILE_DEVICE_ACCEPTANCE.md on physical iOS/Android hardware.');
  }
  console.log('=========================================\n');
}

function loadReleaseId() {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')).releaseId;
}

function loadChecklistInput(pathArg) {
  const raw = pathArg === '-'
    ? readFileSync(0, 'utf8')
    : readFileSync(resolve(pathArg), 'utf8');
  return JSON.parse(raw);
}

function normalizeEvidence(input) {
  const evidence = {
    schemaVersion: 1,
    evidenceId: 'mobile-device-acceptance',
    capturedAt: input.capturedAt || new Date().toISOString(),
    releaseId: input.releaseId || loadReleaseId(),
    protocolVersion: input.protocolVersion || 'mobile-acceptance.v1',
    pass: input.pass === true,
    devices: input.devices || [],
    notes: input.notes,
  };
  return evidence;
}

function allChecksTrue(evidence) {
  if (!evidence.pass) return ['pass must be true'];
  const errors = [];
  for (const device of evidence.devices) {
    for (const key of CHECK_KEYS) {
      if (device.checks?.[key] !== true) {
        errors.push(`${device.platform}/${device.model}: ${key} must be true`);
      }
    }
  }
  return errors;
}

function validateEvidence(evidence) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')));
  if (!validate(evidence)) {
    return (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`);
  }
  return require('./verify-field-evidence.js').semanticChecks('mobile-acceptance', evidence);
}

async function ask(rl, question) {
  return new Promise((resolvePromise) => {
    rl.question(question, (answer) => resolvePromise(answer.trim()));
  });
}

async function askBool(rl, question) {
  const answer = (await ask(rl, `${question} [y/N]: `)).toLowerCase();
  return answer === 'y' || answer === 'yes' || answer === 'true';
}

async function collectInteractive() {
  printProtocol();
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const devices = [];
  try {
    console.log('Interactive capture — record results from PHYSICAL devices only.\n');
    let addAnother = true;
    while (addAnother) {
      const platform = (await ask(rl, 'Platform (ios|android): ')).toLowerCase();
      if (platform !== 'ios' && platform !== 'android') {
        throw new Error('platform must be ios or android');
      }
      const model = await ask(rl, 'Device model (e.g. iPhone 15 Pro): ');
      const osVersion = await ask(rl, 'OS version (optional): ');
      const checks = {};
      for (const key of CHECK_KEYS) {
        checks[key] = await askBool(rl, `${key} passed on device?`);
      }
      const notes = await ask(rl, 'Notes (optional): ');
      devices.push({
        platform,
        model,
        ...(osVersion ? { osVersion } : {}),
        checks,
        ...(notes ? { notes } : {}),
      });
      addAnother = await askBool(rl, 'Add another device?');
    }
    const pass = await askBool(rl, 'Overall acceptance PASS for this release?');
    const notes = await ask(rl, 'Release notes (optional): ');
    return normalizeEvidence({ pass, devices, notes: notes || undefined });
  } finally {
    rl.close();
  }
}

function writeEvidence(evidence, outPath) {
  const checkErrors = allChecksTrue(evidence);
  if (checkErrors.length > 0) {
    console.error('Refusing to write PASS evidence:');
    for (const err of checkErrors) console.error(`  - ${err}`);
    return 1;
  }
  const validationErrors = validateEvidence(evidence);
  if (validationErrors.length > 0) {
    console.error('Evidence failed schema/semantic validation:');
    for (const err of validationErrors) console.error(`  - ${err}`);
    return 1;
  }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(`Wrote mobile acceptance evidence: ${outPath}`);
  return 0;
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    printProtocol();
    return 0;
  }

  const outPath = resolve(readArg('--out', DEFAULT_OUT));
  const interactive = process.argv.includes('--interactive');
  const checklistArg = readArg('--from-checklist');

  if (!interactive && !checklistArg) {
    printUsage();
    printProtocol();
    console.error('Provide --interactive or --from-checklist with operator-recorded results.');
    return 2;
  }

  let evidence;
  if (interactive) {
    evidence = await collectInteractive();
  } else {
    printProtocol();
    try {
      evidence = normalizeEvidence(loadChecklistInput(checklistArg));
    } catch (cause) {
      console.error(`Failed to read checklist: ${cause.message}`);
      return 1;
    }
  }

  return writeEvidence(evidence, outPath);
}

if (require.main === module) {
  main().then((code) => { process.exitCode = code; }).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { normalizeEvidence, validateEvidence, allChecksTrue, printProtocol };
