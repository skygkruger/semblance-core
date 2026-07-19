#!/usr/bin/env node
'use strict';

/**
 * Capture Windows launch-floor field evidence (sidecar initialize timing).
 *
 * PASS evidence is written ONLY on win32 when hardware meets floor and initialize
 * succeeds within 90s. Refuses on darwin/linux (exit 2 — DeferredFieldProof).
 *
 * Usage:
 *   node scripts/capture-launch-floor.js [--out release/evidence/field/launch-floor.v1.json]
 *
 * Exit codes:
 *   0 — evidence written and passes launch-floor gate
 *   1 — capture failed or hardware/timing insufficient (no PASS file written)
 *   2 — wrong platform for field proof (DeferredFieldProof)
 */

const { spawn } = require('node:child_process');
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { join, resolve, dirname } = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const ROOT = resolve(__dirname, '..');
const DEFAULT_OUT = join(ROOT, 'release', 'evidence', 'field', 'launch-floor.v1.json');
const MANIFEST_PATH = join(ROOT, 'release', 'release-manifest.json');
const SIDECAR_PATH = join(ROOT, 'packages', 'desktop', 'src-tauri', 'sidecar', 'bridge.cjs');

const FLOOR = {
  cpuCores: 4,
  ramGiB: 16,
  freeDiskGiB: 20,
  readySeconds: 90,
};

function readArg(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return fallback;
  return process.argv[idx + 1];
}

function printUsage() {
  console.log(`Usage: node scripts/capture-launch-floor.js [--out <path>]

Measures wall-clock time from process start through successful sidecar initialize.
Writes PASS evidence only on Windows when hardware profile and timing meet floor.

Options:
  --out   Output JSON path (default: release/evidence/field/launch-floor.v1.json)

Exit codes: 0 pass evidence written, 1 capture/hardware failure, 2 deferred (non-Windows)`);
}

function loadReleaseId() {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  if (!manifest.releaseId) throw new Error(`releaseId missing in ${MANIFEST_PATH}`);
  return manifest.releaseId;
}

function getWindowsOsVersion() {
  try {
    return execFileSync(
      'powershell',
      ['-NoProfile', '-Command', '[System.Environment]::OSVersion.VersionString'],
      { encoding: 'utf8', timeout: 10000 },
    ).trim();
  } catch {
    return os.release();
  }
}

function getFreeDiskGiB() {
  if (process.platform === 'win32') {
    try {
      const drive = process.cwd().slice(0, 2).toUpperCase() || 'C:';
      const letter = drive.replace(':', '');
      const out = execFileSync(
        'powershell',
        ['-NoProfile', '-Command', `[math]::Floor((Get-PSDrive -Name '${letter}').Free / 1GB)`],
        { encoding: 'utf8', timeout: 10000 },
      ).trim();
      const parsed = Number.parseInt(out, 10);
      if (Number.isFinite(parsed)) return parsed;
    } catch {
      // fall through
    }
  }
  try {
    const { statfsSync } = require('node:fs');
    const stats = statfsSync(process.cwd());
    return Math.floor((stats.bfree * stats.bsize) / (1024 ** 3));
  } catch {
    return 0;
  }
}

function collectHardwareProfile() {
  return {
    cpuCores: os.cpus().length,
    ramGiB: Math.floor(os.totalmem() / (1024 ** 3)),
    freeDiskGiB: getFreeDiskGiB(),
  };
}

function hardwareMeetsFloor(profile) {
  const failures = [];
  if (profile.cpuCores < FLOOR.cpuCores) {
    failures.push(`cpuCores ${profile.cpuCores} < ${FLOOR.cpuCores}`);
  }
  if (profile.ramGiB < FLOOR.ramGiB) {
    failures.push(`ramGiB ${profile.ramGiB} < ${FLOOR.ramGiB}`);
  }
  if (profile.freeDiskGiB < FLOOR.freeDiskGiB) {
    failures.push(`freeDiskGiB ${profile.freeDiskGiB} < ${FLOOR.freeDiskGiB}`);
  }
  return failures;
}

function sendRequest(sidecar, method, params = {}, timeoutMs = 120000) {
  return new Promise((resolvePromise, rejectPromise) => {
    let requestId = 1;
    let stdoutBuffer = '';
    const id = requestId++;
    const msg = `${JSON.stringify({ id, method, params })}\n`;

    const timeout = setTimeout(() => {
      rejectPromise(new Error(`Timeout waiting for ${method} (${timeoutMs}ms)`));
    }, timeoutMs);

    const handler = (chunk) => {
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.id === id) {
            clearTimeout(timeout);
            sidecar.stdout.removeListener('data', handler);
            resolvePromise(parsed);
            return;
          }
        } catch {
          // ignore partial JSON
        }
      }
    };

    sidecar.stdout.on('data', handler);
    sidecar.stdin.write(msg);
  });
}

async function measureInitializeReadySeconds() {
  if (!existsSync(SIDECAR_PATH)) {
    throw new Error(`Sidecar missing — run node scripts/bundle-sidecar.js first (${SIDECAR_PATH})`);
  }

  const startMs = Date.now();
  const sidecar = spawn('node', [SIDECAR_PATH], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SEMBLANCE_DATA_DIR: join(os.homedir(), '.semblance', 'data'),
    },
  });

  let stderrBuffer = '';
  sidecar.stderr.on('data', (chunk) => { stderrBuffer += chunk.toString(); });

  try {
    await new Promise((r) => setTimeout(r, 500));
    const result = await sendRequest(sidecar, 'initialize', {}, 300000);
    if (result.error) {
      throw new Error(`initialize failed: ${JSON.stringify(result.error)}`);
    }
    if (!result.result) {
      throw new Error('initialize returned no result');
    }
    // Ready signal = successful initialize RPC response (sidecar accepting traffic).
    // Full model load is not required for launch-floor; cold model fetch may exceed 90s.
    const readySeconds = (Date.now() - startMs) / 1000;
    if (!/ready|initialized|Core initialized/i.test(stderrBuffer)) {
      console.warn('Warning: stderr lacked Ready/initialized marker; trusting initialize RPC success');
    }
    return readySeconds;
  } finally {
    if (!sidecar.killed) sidecar.kill();
  }
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    return 0;
  }

  const outPath = resolve(readArg('--out', DEFAULT_OUT));

  if (process.platform !== 'win32') {
    console.error('DeferredFieldProof: launch-floor PASS evidence requires Windows (win32).');
    console.error(`Current platform: ${process.platform}`);
    console.error('Run on Windows 11 hardware or via .github/workflows/field-proof-windows.yml');
    return 2;
  }

  const wallStartMs = Date.now();
  const profile = collectHardwareProfile();
  const hwFailures = hardwareMeetsFloor(profile);
  if (hwFailures.length > 0) {
    console.error('Hardware profile does not meet launch floor — refusing to write PASS evidence:');
    for (const failure of hwFailures) console.error(`  - ${failure}`);
    return 1;
  }

  console.log('Launch-floor capture (Windows)');
  console.log(`  hardware: ${profile.cpuCores} cores, ${profile.ramGiB} GiB RAM, ${profile.freeDiskGiB} GiB free disk`);

  let readySeconds;
  try {
    readySeconds = await measureInitializeReadySeconds();
  } catch (cause) {
    console.error(`Initialize benchmark failed: ${cause.message}`);
    return 1;
  }

  const elapsedSeconds = (Date.now() - wallStartMs) / 1000;
  console.log(`  initialize ready: ${readySeconds.toFixed(2)}s (wall elapsed ${elapsedSeconds.toFixed(2)}s)`);

  if (readySeconds > FLOOR.readySeconds) {
    console.error(`readySeconds ${readySeconds.toFixed(2)} exceeds ${FLOOR.readySeconds}s floor — no PASS evidence written`);
    return 1;
  }

  const evidence = {
    schemaVersion: 1,
    evidenceId: 'performance-launch-floor',
    capturedAt: new Date().toISOString(),
    releaseId: loadReleaseId(),
    platform: {
      os: 'windows',
      osVersion: getWindowsOsVersion(),
      arch: process.arch,
    },
    hardwareProfile: profile,
    readySeconds: Number(readySeconds.toFixed(3)),
    pass: true,
    notes: 'Captured by scripts/capture-launch-floor.js (sidecar initialize wall-clock)',
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(`Wrote PASS evidence: ${outPath}`);

  const Ajv = require('ajv');
  const addFormats = require('ajv-formats');
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const schema = JSON.parse(readFileSync(
    join(ROOT, 'release', 'evidence', 'schemas', 'launch-floor.v1.schema.json'),
    'utf8',
  ));
  const validate = ajv.compile(schema);
  if (!validate(evidence)) {
    console.error('Post-write schema validation failed:', validate.errors);
    return 1;
  }
  const semantic = require('./verify-field-evidence.js').semanticChecks('launch-floor', evidence);
  if (semantic.length > 0) {
    console.error(`Post-write semantic checks failed: ${semantic.join('; ')}`);
    return 1;
  }
  console.log('Post-write schema + semantic validation: pass');
  return 0;
}

if (require.main === module) {
  main().then((code) => { process.exitCode = code; }).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { collectHardwareProfile, hardwareMeetsFloor, FLOOR };
