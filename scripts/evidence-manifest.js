#!/usr/bin/env node
'use strict';

const { createHash } = require('node:crypto');
const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require('node:fs');
const { dirname, join, resolve } = require('node:path');

function evidenceError(code, message) {
  const cause = new Error(message);
  cause.code = code;
  return cause;
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isVerifyReport(value) {
  return isObject(value)
    && Array.isArray(value.allFeatures)
    && Number.isInteger(value.totalPass)
    && Number.isInteger(value.totalTests)
    && typeof value.p0Pass === 'boolean'
    && typeof value.p1Pass === 'boolean'
    && typeof value.buildReady === 'boolean'
    && typeof value.date === 'string';
}

function isDataAuditReport(value) {
  return isObject(value)
    && typeof value.timestamp === 'string'
    && isObject(value.databases)
    && Array.isArray(value.connectedServices)
    && isObject(value.documentSources)
    && Array.isArray(value.pipelineGaps)
    && Array.isArray(value.pipelineHealthy)
    && Array.isArray(value.handlerStubs)
    && ['healthy', 'gaps-found', 'unknown'].includes(value.verdict);
}

function evidenceRecord(id, path, validate) {
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw evidenceError('EVIDENCE_FILE_MISSING', `Required evidence output is missing: ${path}`);
  }
  const bytes = readFileSync(path);
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw evidenceError('EVIDENCE_JSON_INVALID', `Evidence is not valid JSON: ${path}`);
  }
  if (!validate(parsed)) {
    throw evidenceError('EVIDENCE_JSON_INVALID', `Evidence has an unexpected report shape: ${path}`);
  }
  return {
    id,
    path,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: bytes.length,
  };
}

/**
 * Build a hash manifest over the two machine-readable runtime evidence files.
 */
function generateEvidenceManifest({ verifyOutput, dataAuditOutput }) {
  return {
    schemaVersion: 1,
    evidence: [
      evidenceRecord('semblance-verify', verifyOutput, isVerifyReport),
      evidenceRecord('data-audit', dataAuditOutput, isDataAuditReport),
    ],
  };
}

function parseArgs(argv) {
  const valueFlags = new Set(['output', 'verify-output', 'data-audit-output']);
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) throw new Error(`Unexpected positional argument: ${argument}`);
    const name = argument.slice(2);
    if (!valueFlags.has(name)) throw new Error(`Unknown argument: --${name}`);
    if (name in options) throw new Error(`Duplicate argument: --${name}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${name}`);
    options[name] = value;
    index += 1;
  }
  return options;
}

function runCli() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (cause) {
    console.error(`ARGUMENT_INVALID: ${cause.message}`);
    return 1;
  }
  if (!args.output) {
    console.error('ARGUMENT_INVALID: --output requires a path');
    return 1;
  }
  const root = resolve(__dirname, '..');
  const verifyOutput = resolve(String(
    args['verify-output'] ?? join(root, '.semblance-verify', 'latest.json'),
  ));
  const dataAuditOutput = resolve(String(
    args['data-audit-output'] ?? join(root, '.semblance-verify', 'data-audit.json'),
  ));
  const output = resolve(String(args.output));

  try {
    const manifest = generateEvidenceManifest({ verifyOutput, dataAuditOutput });
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'w' });
    console.log(`Evidence manifest written: ${output}`);
    return 0;
  } catch (cause) {
    console.error(`${cause.code ?? 'EVIDENCE_MANIFEST_FAILED'}: ${cause.message}`);
    return 1;
  }
}

module.exports = { generateEvidenceManifest };

if (require.main === module) process.exitCode = runCli();
