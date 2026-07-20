#!/usr/bin/env node
'use strict';

/**
 * Multi-model architecture audit — installer runtimes, registry recommend APIs,
 * bootstrap load order, Settings IPC, onboarding download wiring.
 *
 * Usage:
 *   node scripts/audit-multi-model.js
 *   node scripts/audit-multi-model.js --write-evidence
 *
 * Exit: 0 when all checks pass; 1 on any failure.
 */

const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = resolve(__dirname, '..');
const WRITE_EVIDENCE = process.argv.includes('--write-evidence');
const EVIDENCE_PATH = join(ROOT, 'release', 'evidence', 'cross-cutting', 'multi-model-audit.json');

/** @type {Array<{ id: string; ok: boolean; detail: string }>} */
const checks = [];

function pass(id, detail) {
  checks.push({ id, ok: true, detail });
  console.log(`✅ ${id}: ${detail}`);
}

function fail(id, detail) {
  checks.push({ id, ok: false, detail });
  console.error(`❌ ${id}: ${detail}`);
}

function read(relPath) {
  return readFileSync(join(ROOT, relPath), 'utf8');
}

function includesAll(source, needles, label) {
  const missing = needles.filter((n) => !source.includes(n));
  if (missing.length > 0) {
    fail(label, `missing: ${missing.join(', ')}`);
    return false;
  }
  pass(label, `found ${needles.length} required markers`);
  return true;
}

// ─── Installer runtime resources ─────────────────────────────────────────────

const tauriConfPath = 'packages/desktop/src-tauri/tauri.conf.json';
if (!existsSync(join(ROOT, tauriConfPath))) {
  fail('tauri-conf-exists', `${tauriConfPath} missing`);
} else {
  const tauriConf = read(tauriConfPath);
  if (tauriConf.includes('runtimes/**/*')) {
    pass('tauri-runtimes-resource', 'tauri.conf.json bundles runtimes/**/*');
  } else {
    fail('tauri-runtimes-resource', 'tauri.conf.json missing runtimes/**/* resource glob');
  }

  const sidecarBridges = [
    'sidecar/bridge.cjs',
    'sidecar/runtime-core-bridge.cjs',
    'sidecar/runtime-gateway-bridge.cjs',
    'sidecar/runtime-model-bridge.cjs',
  ];
  const missingBridges = sidecarBridges.filter((b) => !tauriConf.includes(b));
  if (missingBridges.length === 0) {
    pass('tauri-sidecar-bridges', `bundles ${sidecarBridges.length} sidecar bridges`);
  } else {
    fail('tauri-sidecar-bridges', `missing bridge resources: ${missingBridges.join(', ')}`);
  }
}

// ─── bundle-runtimes.js ──────────────────────────────────────────────────────

const bundleRuntimes = 'scripts/bundle-runtimes.js';
if (!existsSync(join(ROOT, bundleRuntimes))) {
  fail('bundle-runtimes-exists', `${bundleRuntimes} missing`);
} else {
  pass('bundle-runtimes-exists', bundleRuntimes);
  const bundleSrc = read(bundleRuntimes);
  if (bundleSrc.includes('--check')) {
    const result = spawnSync(process.execPath, [join(ROOT, bundleRuntimes), '--check'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    if (result.status === 0) {
      pass('bundle-runtimes-check', (result.stdout || result.stderr || 'OK').trim().split('\n').pop());
    } else {
      fail('bundle-runtimes-check', (result.stderr || result.stdout || 'bundle-runtimes --check failed').trim());
    }
  } else {
    fail('bundle-runtimes-check-flag', 'bundle-runtimes.js missing --check support');
  }
}

// ─── Model registry exports ──────────────────────────────────────────────────

const registrySrc = read('packages/core/llm/model-registry.ts');
includesAll(
  registrySrc,
  [
    'export function getRecommendedReasoningModel',
    'export function getRecommendedBitNetModel',
  ],
  'registry-recommend-exports',
);

// ─── Bootstrap / onboarding / settings invariants ────────────────────────────

const bridgeSrc = read('packages/desktop/src-tauri/sidecar/bridge.ts');
includesAll(
  bridgeSrc,
  [
    'getRecommendedReasoningModel(tier)',
    'handleGetRecommendedModels',
    'get_recommended_models',
    'handleBitNetSetActive',
    'handleStandardSetActive',
    'Ollama (GPU) → Standard GGUF → BitNet',
  ],
  'bridge-multi-model-handlers',
);

if (bridgeSrc.includes('async function handleStartModelDownloads')) {
  const startIdx = bridgeSrc.indexOf('async function handleStartModelDownloads');
  const endIdx = bridgeSrc.indexOf('\nasync function ', startIdx + 1);
  const startBody = endIdx > startIdx
    ? bridgeSrc.slice(startIdx, endIdx)
    : bridgeSrc.slice(startIdx, startIdx + 12000);
  if (startBody.includes('getRecommendedReasoningModel(tier)')) {
    pass('onboarding-download-reasoning', 'handleStartModelDownloads uses getRecommendedReasoningModel(tier)');
  } else {
    fail('onboarding-download-reasoning', 'handleStartModelDownloads missing getRecommendedReasoningModel(tier)');
  }
} else {
  fail('onboarding-download-reasoning', 'handleStartModelDownloads not found');
}

const onboardingSrc = read('packages/desktop/src/screens/OnboardingFlow.tsx');
includesAll(
  onboardingSrc,
  ['detectHardware', 'startModelDownloads', 'getRecommendedModelsForTier', 'recommendedModel'],
  'onboarding-flow-wiring',
);

const settingsSrc = read('packages/semblance-ui/components/Settings/SettingsAIEngine.web.tsx');
includesAll(
  settingsSrc,
  ['onBitNetActivate', 'onStandardActivate'],
  'settings-ai-engine-activate',
);

// ─── InferenceRouter BitNet availability gate ────────────────────────────────

const routerSrc = read('packages/core/llm/inference-router.ts');
includesAll(
  routerSrc,
  ['bitnetLoadedAndReady', 'resolveProviderAndModelAsync', 'isAvailable()'],
  'inference-router-bitnet-gate',
);

const createLlmSrc = read('packages/core/llm/index.ts');
if (
  createLlmSrc.includes('BitNet is not pre-attached')
  && !createLlmSrc.includes('bitnetProvider,')
) {
  pass('create-llm-no-pre-bitnet', 'createLLMProvider does not pre-attach BitNet to router');
} else {
  fail('create-llm-no-pre-bitnet', 'createLLMProvider still pre-attaches bitnetProvider');
}

// ─── Mutual exclusion prefs ──────────────────────────────────────────────────

if (
  bridgeSrc.includes("setPref('standard_active_model', '')")
  && bridgeSrc.includes("setPref('bitnet_active_model', '')")
) {
  pass('settings-mutual-exclusion-prefs', 'BitNet/standard activate handlers clear opposing pref');
} else {
  fail('settings-mutual-exclusion-prefs', 'missing pref mutual exclusion in activate handlers');
}

// ─── Summary ───────────────────────────────────────────────────────────────

const failed = checks.filter((c) => !c.ok);
const summary = {
  auditedAt: new Date().toISOString(),
  pass: failed.length === 0,
  total: checks.length,
  failed: failed.length,
  checks,
};

console.log('');
console.log(`Multi-model audit: ${failed.length === 0 ? 'PASS' : 'FAIL'} (${checks.length - failed.length}/${checks.length})`);

if (WRITE_EVIDENCE) {
  mkdirSync(join(ROOT, 'release', 'evidence', 'cross-cutting'), { recursive: true });
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(`Evidence written: ${EVIDENCE_PATH}`);
}

process.exit(failed.length === 0 ? 0 : 1);
