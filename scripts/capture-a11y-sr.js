#!/usr/bin/env node
'use strict';

/**
 * Capture VoiceOver / NVDA task-based screen-reader field notes.
 *
 * Does NOT invent results. Operator records checklist after real SR review
 * on a production desktop build (not fixtures alone for FieldProven SR claim).
 *
 * Usage:
 *   node scripts/capture-a11y-sr.js --interactive [--out path]
 *   node scripts/capture-a11y-sr.js --from-checklist checklist.json [--out path]
 *
 * Writes release/evidence/a11y/sr-signoff.v1.json only when pass:true and all
 * required checks are true.
 *
 * Exit: 0 written, 1 validation failure, 2 deferred guidance
 */

const { createInterface } = require('node:readline');
const { readFileSync, existsSync, mkdirSync, writeFileSync } = require('node:fs');
const { join, resolve, dirname } = require('node:path');
const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const ROOT = resolve(__dirname, '..');
const DEFAULT_OUT = join(ROOT, 'release', 'evidence', 'a11y', 'sr-signoff.v1.json');
const MANIFEST_PATH = join(ROOT, 'release', 'release-manifest.json');
const SCHEMA_PATH = join(ROOT, 'release', 'evidence', 'schemas', 'a11y-sr-signoff.v1.schema.json');
const CHECKLIST_PATH = join(ROOT, 'release', 'evidence', 'a11y', 'task-based-checklist.md');

const CHECK_KEYS = [
  'chatWorkflow',
  'proofCenter',
  'settingsNav',
  'offlineProof',
  'noKeyboardTraps',
];

function readArg(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return fallback;
  return process.argv[idx + 1];
}

function printUsage() {
  console.log(`Usage:
  node scripts/capture-a11y-sr.js --interactive [--out <path>]
  node scripts/capture-a11y-sr.js --from-checklist <file|-> [--out <path>]

Writes sr-signoff.v1.json only when pass:true and every check is true.
Requires a real VoiceOver (macOS) or NVDA/JAWS (Windows) session on a
production desktop build. Automated fixture a11y is separate (a11y-gate.js).

Checklist: release/evidence/a11y/task-based-checklist.md`);
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
  return {
    schemaVersion: 1,
    evidenceId: 'a11y-sr-signoff',
    capturedAt: input.capturedAt || new Date().toISOString(),
    releaseId: input.releaseId || loadReleaseId(),
    screenReader: input.screenReader,
    platform: input.platform,
    buildId: input.buildId || input.releaseId || loadReleaseId(),
    pass: input.pass === true,
    checks: input.checks || {},
    reviewer: input.reviewer,
    notes: input.notes,
  };
}

function allChecksTrue(evidence) {
  const errors = [];
  if (!evidence.pass) errors.push('pass must be true');
  if (!evidence.screenReader || !['voiceover', 'nvda', 'jaws'].includes(evidence.screenReader)) {
    errors.push('screenReader must be voiceover|nvda|jaws');
  }
  if (!evidence.platform || !['macos', 'windows'].includes(evidence.platform)) {
    errors.push('platform must be macos|windows');
  }
  for (const key of CHECK_KEYS) {
    if (evidence.checks?.[key] !== true) errors.push(`${key} must be true`);
  }
  return errors;
}

function validateEvidence(evidence) {
  if (!existsSync(SCHEMA_PATH)) {
    return [`schema missing: ${SCHEMA_PATH}`];
  }
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')));
  if (!validate(evidence)) {
    return (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`);
  }
  return [];
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
  console.log('\n=== Task-based screen-reader sign-off ===');
  if (existsSync(CHECKLIST_PATH)) {
    console.log(`Checklist: ${CHECKLIST_PATH}\n`);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const screenReader = (await ask(rl, 'Screen reader (voiceover|nvda|jaws): ')).toLowerCase();
    const platform = (await ask(rl, 'Platform (macos|windows): ')).toLowerCase();
    const buildId = await ask(rl, 'Build / release ID: ');
    const reviewer = await ask(rl, 'Reviewer name: ');
    const checks = {};
    for (const key of CHECK_KEYS) {
      checks[key] = await askBool(rl, `${key} passed?`);
    }
    const pass = await askBool(rl, 'Overall SR sign-off PASS?');
    const notes = await ask(rl, 'Notes (optional): ');
    return normalizeEvidence({
      screenReader,
      platform,
      buildId: buildId || undefined,
      reviewer: reviewer || undefined,
      checks,
      pass,
      notes: notes || undefined,
    });
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
    console.error('Evidence failed schema validation:');
    for (const err of validationErrors) console.error(`  - ${err}`);
    return 1;
  }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(`Wrote SR sign-off evidence: ${outPath}`);
  return 0;
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    return 0;
  }

  const outPath = resolve(readArg('--out', DEFAULT_OUT));
  const interactive = process.argv.includes('--interactive');
  const checklistArg = readArg('--from-checklist');

  if (!interactive && !checklistArg) {
    printUsage();
    console.error('\nProvide --interactive or --from-checklist with operator-recorded results.');
    console.error('This host cannot invent VoiceOver/NVDA results.');
    return 2;
  }

  let evidence;
  if (interactive) {
    evidence = await collectInteractive();
  } else {
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
  main().then((code) => { process.exit(code ?? 0); }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { normalizeEvidence, allChecksTrue, CHECK_KEYS };
