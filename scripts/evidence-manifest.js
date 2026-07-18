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

function evidenceRecord(id, path) {
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw evidenceError('EVIDENCE_FILE_MISSING', `Required evidence output is missing: ${path}`);
  }
  const bytes = readFileSync(path);
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
      evidenceRecord('semblance-verify', verifyOutput),
      evidenceRecord('data-audit', dataAuditOutput),
    ],
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument.startsWith('--') && argv[index + 1] && !argv[index + 1].startsWith('--')) {
      options[argument.slice(2)] = argv[index + 1];
      index += 1;
    }
  }
  return options;
}

function runCli() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.output) {
    console.error(
      'Usage: node scripts/evidence-manifest.js --output <path> '
      + '[--verify-output <path>] [--data-audit-output <path>]',
    );
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
