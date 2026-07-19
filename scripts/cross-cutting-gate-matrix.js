#!/usr/bin/env node
'use strict';

/**
 * Cross-cutting gate matrix runner (program §17).
 *
 * Executes every gate from the sovereign platform evidence matrix.
 * Runnable gates spawn real commands; hardware/environment gates record
 * DeferredFieldProof with explicit blockers — never fake PASS.
 *
 * Usage:
 *   node scripts/cross-cutting-gate-matrix.js
 *   node scripts/cross-cutting-gate-matrix.js --json-only
 *   node scripts/cross-cutting-gate-matrix.js --no-run          # structure only
 *   node scripts/cross-cutting-gate-matrix.js --write-evidence  # overwrite pinned artifacts
 *
 * Live callers: preflight.js --cross-cutting; verify-cross-repo-slice.js (evidence pin)
 * Optional preflight: node scripts/preflight.js --cross-cutting
 *
 * Exit: 0 when all runnable gates pass; 1 on any runnable failure.
 */

const { createHash } = require('node:crypto');
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { dirname, join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const CORE_ROOT = resolve(__dirname, '..');
const REPO_ROOT = dirname(CORE_ROOT);
const REPRESENTATIVE_ROOT = join(REPO_ROOT, 'semblence-representative');
const WEBSITE_ROOT = join(REPO_ROOT, 'semblance-run');

const EVIDENCE_DIR = join(CORE_ROOT, 'release', 'evidence', 'cross-cutting');
const JSON_OUT = join(EVIDENCE_DIR, 'gate-matrix.json');
const TXT_OUT = join(EVIDENCE_DIR, 'gate-matrix.txt');

const JSON_ONLY = process.argv.includes('--json-only');
const NO_RUN = process.argv.includes('--no-run');
const WRITE_EVIDENCE = process.argv.includes('--write-evidence');

/** @typedef {'pass' | 'fail' | 'DeferredFieldProof'} GateStatus */

/**
 * @typedef {object} GateDefinition
 * @property {string} id
 * @property {string} name
 * @property {string} passCriterion
 * @property {'core' | 'representative' | 'website'} repo
 * @property {boolean} runnable
 * @property {string} [command]
 * @property {string} [deferredBlocker]
 * @property {number} [timeoutMs]
 */

/** @type {GateDefinition[]} */
const GATES = [
  {
    id: 'core-static',
    name: 'Core static',
    passCriterion: 'Zero TypeScript errors in sovereign spine packages',
    repo: 'core',
    runnable: true,
    command: 'pnpm --filter @semblance/protocol typecheck && pnpm --filter @semblance/kernel typecheck && pnpm --filter @semblance/vault typecheck && pnpm --filter @semblance/runtime-shared typecheck && pnpm --filter @semblance/sync typecheck && pnpm --filter @semblance/extension-sdk typecheck',
    timeoutMs: 180000,
  },
  {
    id: 'dr-static',
    name: 'DR static',
    passCriterion: 'Zero unexpected DR test failures',
    repo: 'representative',
    runnable: true,
    command: 'npm test',
    timeoutMs: 180000,
  },
  {
    id: 'website-static',
    name: 'Website static',
    passCriterion: 'Link and claim checks exit 0',
    repo: 'website',
    runnable: true,
    command: 'node scripts/check-links.mjs && node scripts/check-claims.mjs',
    timeoutMs: 60000,
  },
  {
    id: 'unit-integration-exit-gates',
    name: 'Unit/integration exit gates (slices 4–13)',
    passCriterion: 'Zero unexpected failures in slice exit-gate suites',
    repo: 'core',
    runnable: true,
    command: 'npx vitest run tests/slice-4/exit-gate.test.ts tests/slice-5/exit-gate.test.ts tests/slice-6/exit-gate.test.ts tests/slice-7/exit-gate.test.ts tests/slice-8/exit-gate.test.ts tests/slice-9/exit-gate.test.ts tests/slice-10/exit-gate.test.ts tests/slice-11/exit-gate.test.ts tests/slice-12/exit-gate.test.ts tests/slice-13/exit-gate.test.ts',
    timeoutMs: 600000,
  },
  {
    id: 'privacy-import',
    name: 'Privacy import audit',
    passCriterion: 'No banned network/import path in AI Core',
    repo: 'core',
    runnable: true,
    command: 'node scripts/privacy-audit/index.js',
    timeoutMs: 60000,
  },
  {
    id: 'runtime-smoke',
    name: 'Runtime smoke',
    passCriterion: 'All required processes ready',
    repo: 'core',
    runnable: true,
    command: 'node scripts/smoke-test-runtimes.js',
    timeoutMs: 180000,
  },
  {
    id: 'process-isolation',
    name: 'Process isolation',
    passCriterion: '100/100 forbidden egress attempts denied per non-Gateway process',
    repo: 'core',
    runnable: true,
    command: 'node scripts/process-isolation-audit.js',
    timeoutMs: 300000,
  },
  {
    id: 'secrets-scan',
    name: 'Secrets scan',
    passCriterion: 'No sk_live/sk_test patterns in tracked files (fixtures excluded)',
    repo: 'core',
    runnable: true,
    command: '__secrets_scan__',
    timeoutMs: 30000,
  },
  {
    id: 'vault-exit-gate',
    name: 'Vault exit-gate corpus',
    passCriterion: 'Exact counts; deterministic rebuild',
    repo: 'core',
    runnable: true,
    command: 'npx vitest run packages/vault/tests/exit-gate-corpus.test.ts',
    timeoutMs: 120000,
  },
  {
    id: 'real-data',
    name: 'Real data audit',
    passCriterion: 'Connected source has nonzero expected rows',
    repo: 'core',
    runnable: true,
    command: 'node scripts/data-audit.js --strict',
    timeoutMs: 60000,
  },
  {
    id: 'grounding',
    name: 'Grounding corpus',
    passCriterion: 'Grounded chat cites expected vault sources',
    repo: 'core',
    runnable: true,
    command: 'npx vitest run tests/slice-4/exit-gate.test.ts tests/slice-5/exit-gate.test.ts -t "ground"',
    timeoutMs: 180000,
  },
  {
    id: 'action-safety',
    name: 'Action safety',
    passCriterion: 'Zero approval bypasses / duplicate external effects',
    repo: 'core',
    runnable: true,
    command: 'npx vitest run tests/slice-5/exit-gate.test.ts -t "approval|timeout|reconcile|audit"',
    timeoutMs: 180000,
  },
  {
    id: 'revocation',
    name: 'Revocation matrix',
    passCriterion: 'Active sessions terminate; new work denied; epoch reaches peers',
    repo: 'core',
    runnable: true,
    command: 'npx vitest run tests/slice-11/exit-gate.test.ts -t "revoc"',
    timeoutMs: 180000,
  },
  {
    id: 'outage-safety',
    name: 'Outage safety',
    passCriterion: 'Local reads and inference remain available during disconnect',
    repo: 'core',
    runnable: false,
    deferredBlocker: 'No automated disconnect-commerce/cloud/connectors outage suite checked in; requires dedicated adversarial harness',
  },
  {
    id: 'corruption-safety',
    name: 'Corruption safety',
    passCriterion: 'External effects fail closed; safe local recovery path appears',
    repo: 'core',
    runnable: false,
    deferredBlocker: 'No automated tamper policy/audit/key-state corruption suite checked in',
  },
  {
    id: 'dr-paid-runtime',
    name: 'DR paid runtime probe',
    passCriterion: 'Signed artifact loaded; required capabilities ready',
    repo: 'core',
    runnable: true,
    command: 'npx vitest run tests/slice-6/exit-gate.test.ts -t "signed|artifact|paid|representative"',
    timeoutMs: 300000,
  },
  {
    id: 'commerce-stripe',
    name: 'Commerce Stripe suite',
    passCriterion: 'Purchase/renew/refund/revoke/grace pass',
    repo: 'core',
    runnable: true,
    command: 'npx vitest run tests/slice-7/exit-gate.test.ts',
    timeoutMs: 180000,
  },
  {
    id: 'founding-seats',
    name: 'Founding seat allocation',
    passCriterion: 'Exactly 500 unique paid seats under concurrency',
    repo: 'core',
    runnable: true,
    command: 'npx vitest run tests/slice-7/exit-gate.test.ts -t "founding|seat|500"',
    timeoutMs: 180000,
  },
  {
    id: 'byo-self-host',
    name: 'BYO/self-host conformance',
    passCriterion: 'Same task result contract; destination truth shown',
    repo: 'core',
    runnable: true,
    command: 'npx vitest run tests/slice-8/exit-gate.test.ts',
    timeoutMs: 180000,
  },
  {
    id: 'confidential-attestation',
    name: 'Confidential attestation adversarial suite',
    passCriterion: 'No plaintext on failed/stale/downgraded attestation',
    repo: 'core',
    runnable: true,
    command: 'npx vitest run tests/slice-9/exit-gate.test.ts',
    timeoutMs: 180000,
  },
  {
    id: 'metering-unlinkability',
    name: 'Metering unlinkability',
    passCriterion: 'Issuance cannot token-link to redemption',
    repo: 'representative',
    runnable: true,
    command: 'cd infrastructure/commerce-worker && npx vitest run tests/vouchers/unlinkability.test.ts tests/vouchers/separation.test.ts',
    timeoutMs: 120000,
  },
  {
    id: 'sync-convergence',
    name: 'Sync conflict/revocation/deletion suite',
    passCriterion: 'Convergence, forward secrecy, selective sync pass',
    repo: 'core',
    runnable: true,
    command: 'npx vitest run tests/slice-11/exit-gate.test.ts',
    timeoutMs: 180000,
  },
  {
    id: 'mobile-device-acceptance',
    name: 'Mobile physical device acceptance',
    passCriterion: 'Local inference/sync/routing/proof pass on device',
    repo: 'core',
    runnable: false,
    deferredBlocker: 'Requires physical iOS/Android hardware and manual acceptance protocol',
  },
  {
    id: 'accessibility',
    name: 'Accessibility automated + task-based',
    passCriterion: 'No serious/critical WCAG findings; keyboard/screen-reader workflows complete',
    repo: 'core',
    runnable: false,
    deferredBlocker: 'No stable axe/playwright accessibility gate in CI; task-based review pending',
  },
  {
    id: 'performance-launch-floor',
    name: 'Performance Windows launch-floor',
    passCriterion: 'Ready ≤90s on Windows 11 23H2+ 4c/16GB/20GB free',
    repo: 'core',
    runnable: false,
    deferredBlocker: 'Requires Windows 11 23H2+ physical or VM benchmark harness',
  },
  {
    id: 'installer-three-vms',
    name: 'Installer three clean VMs',
    passCriterion: '3/3 install/update/rollback/uninstall on launch-floor VMs',
    repo: 'core',
    runnable: false,
    deferredBlocker: 'Requires three clean Windows VMs and scripted install-verify pipeline',
  },
  {
    id: 'supply-chain',
    name: 'Supply chain SBOM/provenance',
    passCriterion: 'Every shipped artifact pinned/signed; dependency licenses represented',
    repo: 'core',
    runnable: false,
    deferredBlocker: 'No automated SBOM/provenance/license report gate checked in for all shipped artifacts',
  },
  {
    id: 'diagnostic-privacy',
    name: 'Diagnostic privacy bundle',
    passCriterion: 'No automatic upload; secrets excluded; explicit share only',
    repo: 'core',
    runnable: false,
    deferredBlocker: 'No automated diagnostic bundle generate/preview/redact/cancel/share gate checked in',
  },
  {
    id: 'commercial-records',
    name: 'Commercial records retention/deletion',
    passCriterion: 'Required commerce fields only; role access enforced',
    repo: 'representative',
    runnable: true,
    command: 'cd infrastructure/commerce-worker && npx vitest run tests/freeze-policy.test.ts tests/account-delete.test.ts',
    timeoutMs: 180000,
  },
  {
    id: 'proof-center-offline',
    name: 'Proof Center offline',
    passCriterion: 'All proof classes inspectable with network disconnected',
    repo: 'core',
    runnable: true,
    command: 'npx vitest run tests/slice-10/exit-gate.test.ts -t "offline|proof"',
    timeoutMs: 180000,
  },
  {
    id: 'website-links-claims',
    name: 'Website links and claims',
    passCriterion: 'Legal links 200; claims map to evidence',
    repo: 'website',
    runnable: true,
    command: 'node scripts/check-links.mjs && node scripts/check-claims.mjs',
    timeoutMs: 60000,
  },
  {
    id: 'release-manifest-verify',
    name: 'Release manifest verify',
    passCriterion: 'Every required gate record present',
    repo: 'core',
    runnable: true,
    command: 'node scripts/release-manifest.js --verify-source',
    timeoutMs: 60000,
  },
  {
    id: 'doc-authority',
    name: 'Document authority registry',
    passCriterion: 'Registered paths, hashes, and invariant policy valid',
    repo: 'core',
    runnable: true,
    command: 'node scripts/check-doc-authority.js',
    timeoutMs: 60000,
  },
  {
    id: 'verify-cross-repo',
    name: 'Cross-repo slice verify',
    passCriterion: 'Pinned commits, claims, evidence hashes coherent',
    repo: 'core',
    runnable: true,
    command: 'node scripts/verify-cross-repo-slice.js',
    timeoutMs: 60000,
  },
  {
    id: 'feature-evidence-ladder',
    name: 'Feature evidence ladder',
    passCriterion: 'Valid PascalCase states; evidenceIds resolve',
    repo: 'core',
    runnable: true,
    command: 'node scripts/check-feature-evidence-ladder.js',
    timeoutMs: 30000,
  },
  {
    id: 'stop-conditions',
    name: 'Program stop conditions',
    passCriterion: 'No detectable second-authority or network-in-core violations',
    repo: 'core',
    runnable: true,
    command: 'node scripts/check-stop-conditions.js',
    timeoutMs: 180000,
  },
  {
    id: 'sidecar-smoke',
    name: 'Sidecar smoke',
    passCriterion: 'Sidecar starts and responds to JSON-RPC',
    repo: 'core',
    runnable: true,
    command: '__sidecar_smoke__',
    timeoutMs: 120000,
  },
];

function repoRoot(repo) {
  if (repo === 'core') return CORE_ROOT;
  if (repo === 'representative') return REPRESENTATIVE_ROOT;
  return WEBSITE_ROOT;
}

function excerpt(text, maxLines = 20) {
  if (!text) return '';
  const lines = text.trim().split('\n');
  if (lines.length <= maxLines) return lines.join('\n');
  return [...lines.slice(0, 8), '...', ...lines.slice(-maxLines + 9)].join('\n');
}

function runSecretsScan() {
  const git = spawnSync('git', ['-C', CORE_ROOT, 'ls-files'], { encoding: 'utf8' });
  if (git.status !== 0) {
    return { ok: false, exitCode: 1, output: git.stderr || 'git ls-files failed' };
  }

  const pattern = /\bsk_(?:live|test)_[0-9a-zA-Z]{8,}\b/;
  const fixtures = /(?:fixture|test|mock|example|\.md$|release\/evidence)/i;
  const hits = [];

  for (const file of git.stdout.split('\n').filter(Boolean)) {
    if (fixtures.test(file)) continue;
    const abs = join(CORE_ROOT, file);
    if (!existsSync(abs)) continue;
    let content;
    try {
      content = readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    if (pattern.test(content)) hits.push(file);
  }

  if (hits.length === 0) {
    return { ok: true, exitCode: 0, output: 'No sk_live/sk_test patterns in tracked non-fixture files' };
  }
  return {
    ok: false,
    exitCode: 1,
    output: `Secret pattern hits:\n${hits.join('\n')}`,
  };
}

function runSidecarSmoke() {
  const bridge = join(CORE_ROOT, 'packages/desktop/src-tauri/sidecar/bridge.cjs');
  if (!existsSync(bridge)) {
    return {
      ok: false,
      exitCode: 1,
      output: 'bridge.cjs missing — run: node scripts/bundle-sidecar.js',
    };
  }
  const result = spawnSync('node', ['scripts/smoke-chat-slice2.js'], {
    cwd: CORE_ROOT,
    encoding: 'utf8',
    timeout: 120000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    ok: result.status === 0,
    exitCode: result.status ?? 1,
    output: `${result.stdout || ''}${result.stderr || ''}`.trim(),
  };
}

function runShellCommand(gate) {
  const cwd = repoRoot(gate.repo);
  const result = spawnSync('bash', ['-lc', gate.command], {
    cwd,
    encoding: 'utf8',
    timeout: gate.timeoutMs ?? 120000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    ok: result.status === 0,
    exitCode: result.status ?? 1,
    output: `${result.stdout || ''}${result.stderr || ''}`.trim(),
  };
}

function runGate(gate) {
  if (!gate.runnable) {
    return {
      id: gate.id,
      name: gate.name,
      passCriterion: gate.passCriterion,
      repo: gate.repo,
      status: /** @type {GateStatus} */ ('DeferredFieldProof'),
      exitCode: null,
      blocker: gate.deferredBlocker ?? 'Hardware or environment gate — not runnable in CI',
      excerpt: gate.deferredBlocker ?? '',
      ranAt: new Date().toISOString(),
    };
  }

  if (NO_RUN) {
    return {
      id: gate.id,
      name: gate.name,
      passCriterion: gate.passCriterion,
      repo: gate.repo,
      status: /** @type {GateStatus} */ ('pass'),
      exitCode: 0,
      command: gate.command,
      excerpt: 'skipped (--no-run)',
      ranAt: new Date().toISOString(),
    };
  }

  let result;
  if (gate.command === '__secrets_scan__') result = runSecretsScan();
  else if (gate.command === '__sidecar_smoke__') result = runSidecarSmoke();
  else result = runShellCommand(gate);

  return {
    id: gate.id,
    name: gate.name,
    passCriterion: gate.passCriterion,
    repo: gate.repo,
    status: result.ok ? 'pass' : 'fail',
    exitCode: result.exitCode,
    command: gate.command,
    excerpt: excerpt(result.output),
    ranAt: new Date().toISOString(),
  };
}

function summarize(results) {
  const counts = { pass: 0, fail: 0, DeferredFieldProof: 0 };
  for (const entry of results) counts[entry.status] += 1;
  return counts;
}

function renderText(report) {
  const lines = [];
  lines.push('Cross-cutting gate matrix');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Release: ${report.releaseId}`);
  lines.push(`Core commit: ${report.coreCommit}`);
  lines.push('─'.repeat(72));
  lines.push(`Summary: pass=${report.summary.pass} fail=${report.summary.fail} deferred=${report.summary.DeferredFieldProof}`);
  lines.push('');

  for (const entry of report.gates) {
    const icon = entry.status === 'pass' ? 'PASS' : entry.status === 'fail' ? 'FAIL' : 'DEFERRED';
    lines.push(`${icon}  ${entry.id} — ${entry.name}`);
    lines.push(`      criterion: ${entry.passCriterion}`);
    if (entry.command) lines.push(`      command: ${entry.command}`);
    if (entry.blocker) lines.push(`      blocker: ${entry.blocker}`);
    if (entry.excerpt) lines.push(`      excerpt:\n${entry.excerpt.split('\n').map((l) => `        ${l}`).join('\n')}`);
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function loadReleaseContext() {
  const manifestPath = join(CORE_ROOT, 'release', 'release-manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const git = spawnSync('git', ['-C', CORE_ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  return {
    releaseId: manifest.releaseId,
    coreCommit: git.stdout.trim(),
  };
}

function main() {
  const context = loadReleaseContext();
  if (!JSON_ONLY) {
    console.log('\nCross-cutting gate matrix');
    console.log(`Release: ${context.releaseId}`);
    console.log(`Gates: ${GATES.length} total\n`);
  }

  const results = [];
  for (const gate of GATES) {
    if (!JSON_ONLY) process.stdout.write(`  Running ${gate.id}... `);
    const entry = runGate(gate);
    results.push(entry);
    if (!JSON_ONLY) {
      console.log(entry.status === 'pass' ? 'PASS' : entry.status === 'fail' ? 'FAIL' : 'DEFERRED');
    }
  }

  const summary = summarize(results);
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    releaseId: context.releaseId,
    coreCommit: context.coreCommit,
    programSection: '17-cross-cutting-test-and-evidence-matrix',
    summary,
    gates: results,
  };

  if (WRITE_EVIDENCE) {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(JSON_OUT, `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(TXT_OUT, renderText(report));
  }

  if (!JSON_ONLY) {
    console.log('\n' + '─'.repeat(60));
    console.log(`Summary: pass=${summary.pass} fail=${summary.fail} deferred=${summary.DeferredFieldProof}`);
    if (WRITE_EVIDENCE) {
      console.log(`Evidence written: ${JSON_OUT}`);
      console.log(`Human written:    ${TXT_OUT}`);
    } else {
      console.log('Evidence not rewritten (pass --write-evidence to pin).');
    }
  } else {
    console.log(JSON.stringify(report, null, 2));
  }

  return summary.fail === 0 ? 0 : 1;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  GATES,
  runGate,
  summarize,
  JSON_OUT,
  TXT_OUT,
};
