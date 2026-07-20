#!/usr/bin/env node
'use strict';

/**
 * Capture per-VM Windows installer lifecycle evidence for the three-VM matrix.
 *
 * win32 only for PASS result JSON. Fails closed when update/rollback cannot be
 * executed honestly without --prior-installer + --current-installer or the
 * documented same-version reinstall proxy env gate.
 *
 * Usage:
 *   node scripts/capture-installer-vm.js \
 *     --vm-id vm-a \
 *     --installer-path path/to/Semblance.msi \
 *     --result-out /tmp/vm-a.json
 *
 * Optional upgrade path:
 *   --prior-installer old.msi --current-installer new.msi
 *
 * Same-version CI proxy (documented in result notes):
 *   SEMBLANCE_INSTALLER_MATRIX_ALLOW_SAME_VERSION_REENSTALL=1
 *
 * Exit: 0 result written with full lifecycle pass, 1 failure, 2 deferred (non-Windows)
 */

const { spawnSync } = require('node:child_process');
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { join, resolve, dirname, basename } = require('node:path');

const ROOT = resolve(__dirname, '..');
const ALLOW_SAME_VERSION = process.env.SEMBLANCE_INSTALLER_MATRIX_ALLOW_SAME_VERSION_REENSTALL === '1';

function readArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1];
}

function printUsage() {
  console.log(`Usage: node scripts/capture-installer-vm.js \\
  --vm-id <id> \\
  --installer-path <msi> \\
  --result-out <json> \\
  [--prior-installer <msi>] \\
  [--current-installer <msi>]

Environment:
  SEMBLANCE_INSTALLER_MATRIX_ALLOW_SAME_VERSION_REENSTALL=1
    Allows reinstall-as-update-proxy when only one MSI is available (CI). Notes field documents proxy.

Exit codes: 0 full lifecycle pass, 1 failure / incomplete lifecycle, 2 deferred (non-Windows)`);
}

function runMsiexec(args, label) {
  const logPath = join(require('node:os').tmpdir(), `semblance-msiexec-${Date.now()}.log`);
  const withLog = [...args, '/l*v', logPath];
  const result = spawnSync('msiexec', withLog, {
    encoding: 'utf8',
    timeout: 600000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    let logTail = '';
    try {
      if (existsSync(logPath)) {
        const full = readFileSync(logPath, 'utf8');
        logTail = full.slice(-2000);
      }
    } catch {
      // ignore log read failures
    }
    throw new Error(
      `${label} failed (exit ${result.status}): ${result.stderr || result.stdout}\n`
      + `msiexec log tail (${logPath}):\n${logTail}`,
    );
  }
}

function getMsiProductCode(msiPath) {
  const ps = [
    '$installer = New-Object -ComObject WindowsInstaller.Installer',
    `$db = $installer.OpenDatabase('${msiPath.replace(/'/g, "''")}', 0)`,
    '$view = $db.OpenView("SELECT Value FROM Property WHERE Property = \'ProductCode\'")',
    '$view.Execute()',
    '$record = $view.Fetch()',
    'if ($null -eq $record) { exit 2 }',
    '$record.StringData(1)',
  ].join('; ');
  const result = spawnSync('powershell', ['-NoProfile', '-Command', ps], {
    encoding: 'utf8',
    timeout: 60000,
  });
  const code = (result.stdout || '').trim();
  if (result.status !== 0 || !/^\{[0-9A-F-]+\}$/i.test(code)) {
    throw new Error(`Could not read ProductCode from MSI: ${result.stderr || result.stdout}`);
  }
  return code;
}

function findInstalledSidecar() {
  const os = require('node:os');
  const roots = [
    join(os.homedir(), 'AppData', 'Local', 'Programs', 'Semblance'),
    join('C:\\', 'Program Files', 'Semblance'),
    join('C:\\', 'Program Files (x86)', 'Semblance'),
  ];
  const relatives = [
    join('sidecar', 'bridge.cjs'),
    join('resources', 'sidecar', 'bridge.cjs'),
  ];
  const candidates = [];
  for (const root of roots) {
    for (const rel of relatives) {
      candidates.push(join(root, rel));
    }
  }
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  // Last resort: WiX/NSIS layout can vary by Tauri version — search under known roots.
  const searchPs = [
    '$ErrorActionPreference = "SilentlyContinue"',
    '$roots = @(',
    `  '${roots[0].replace(/'/g, "''")}',`,
    `  '${roots[1].replace(/'/g, "''")}',`,
    `  '${roots[2].replace(/'/g, "''")}'`,
    ')',
    'foreach ($r in $roots) {',
    '  if (Test-Path $r) {',
    '    $hit = Get-ChildItem -Path $r -Filter bridge.cjs -Recurse -File | Select-Object -First 1',
    '    if ($null -ne $hit) { $hit.FullName; exit 0 }',
    '  }',
    '}',
    'exit 1',
  ].join('; ');
  const result = spawnSync('powershell', ['-NoProfile', '-Command', searchPs], {
    encoding: 'utf8',
    timeout: 60000,
  });
  const found = (result.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop();
  if (result.status === 0 && found && existsSync(found)) return found;
  return null;
}

function describeInstallLayout() {
  const os = require('node:os');
  const roots = [
    join(os.homedir(), 'AppData', 'Local', 'Programs', 'Semblance'),
    join('C:\\', 'Program Files', 'Semblance'),
    join('C:\\', 'Program Files (x86)', 'Semblance'),
  ];
  const lines = [];
  for (const root of roots) {
    if (!existsSync(root)) {
      lines.push(`${root}: (missing)`);
      continue;
    }
    const listing = spawnSync('powershell', [
      '-NoProfile',
      '-Command',
      `Get-ChildItem -LiteralPath '${root.replace(/'/g, "''")}' -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 40 -ExpandProperty FullName`,
    ], { encoding: 'utf8', timeout: 60000 });
    lines.push(`${root}:`);
    lines.push((listing.stdout || listing.stderr || '(empty)').trim() || '(empty)');
  }
  return lines.join('\n');
}

function sidecarInstalled() {
  return findInstalledSidecar() !== null;
}

function runSidecarSmoke(sidecarPath, label) {
  const env = { ...process.env, SEMBLANCE_SIDECAR_OVERRIDE: sidecarPath };
  const smoke = spawnSync('node', [join(ROOT, 'scripts', 'smoke-test-sidecar.js')], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 360000,
    stdio: 'pipe',
    env,
  });
  if (smoke.status !== 0) {
    throw new Error(`${label} sidecar smoke failed:\n${smoke.stdout}\n${smoke.stderr}`);
  }
}

function runSidecarInitializeOnly(sidecarPath, label) {
  // Faster path for matrix: reuse smoke script env override once wired; for now delegate to smoke.
  runSidecarSmoke(sidecarPath, label);
}


function installMsi(msiPath) {
  runMsiexec(['/i', msiPath, '/qn', '/norestart'], `Install ${basename(msiPath)}`);
}

function uninstallMsi(productCode, label) {
  runMsiexec(['/x', productCode, '/qn', '/norestart'], label);
}

function assertSidecarGone() {
  if (sidecarInstalled()) {
    throw new Error('Sidecar still present after uninstall');
  }
}

function resolveMsi(pathArg, label) {
  if (!pathArg) throw new Error(`${label} path required`);
  const abs = resolve(pathArg);
  if (!existsSync(abs)) throw new Error(`${label} not found: ${abs}`);
  if (!/\.msi$/i.test(abs)) throw new Error(`${label} must be .msi`);
  return abs;
}

function captureVmLifecycle(options) {
  const {
    vmId,
    installerPath,
    priorInstaller,
    currentInstaller,
  } = options;

  const notes = [];
  let installPass = false;
  let updatePass = false;
  let rollbackPass = false;
  let uninstallPass = false;

  const primaryMsi = resolveMsi(installerPath, 'installer-path');
  const hasDualArtifacts = Boolean(priorInstaller && currentInstaller);
  const priorMsi = priorInstaller ? resolveMsi(priorInstaller, 'prior-installer') : null;
  const currentMsi = currentInstaller ? resolveMsi(currentInstaller, 'current-installer') : primaryMsi;

  if (!hasDualArtifacts && !ALLOW_SAME_VERSION) {
    throw new Error(
      'updatePass/rollbackPass require --prior-installer and --current-installer, '
      + 'or set SEMBLANCE_INSTALLER_MATRIX_ALLOW_SAME_VERSION_REENSTALL=1 for documented same-MSI proxy',
    );
  }

  if (hasDualArtifacts) {
    notes.push('Real upgrade path: prior → current → rollback to prior');
    installMsi(priorMsi);
    let sidecar = findInstalledSidecar();
    if (!sidecar) throw new Error('Sidecar missing after prior install');
    runSidecarInitializeOnly(sidecar, 'prior install');
    installPass = true;

    installMsi(currentMsi);
    sidecar = findInstalledSidecar();
    if (!sidecar) throw new Error('Sidecar missing after update install');
    runSidecarInitializeOnly(sidecar, 'update install');
    updatePass = true;

    const currentCode = getMsiProductCode(currentMsi);
    uninstallMsi(currentCode, 'Uninstall current for rollback');
    installMsi(priorMsi);
    sidecar = findInstalledSidecar();
    if (!sidecar) throw new Error('Sidecar missing after rollback install');
    runSidecarInitializeOnly(sidecar, 'rollback install');
    rollbackPass = true;

    const priorCode = getMsiProductCode(priorMsi);
    uninstallMsi(priorCode, 'Final uninstall');
    assertSidecarGone();
    uninstallPass = true;
  } else {
    notes.push(
      'Same-version reinstall proxy enabled via SEMBLANCE_INSTALLER_MATRIX_ALLOW_SAME_VERSION_REENSTALL=1; '
      + 'updatePass/rollbackPass represent reinstall smoke, not a distinct artifact upgrade',
    );

    installMsi(primaryMsi);
    let sidecar = findInstalledSidecar();
    if (!sidecar) {
      throw new Error(`Sidecar missing after install.\nInstall layout:\n${describeInstallLayout()}`);
    }
    runSidecarInitializeOnly(sidecar, 'install');
    installPass = true;

    const productCode = getMsiProductCode(primaryMsi);
    uninstallMsi(productCode, 'Uninstall before update proxy');
    assertSidecarGone();

    installMsi(primaryMsi);
    sidecar = findInstalledSidecar();
    if (!sidecar) throw new Error('Sidecar missing after update proxy reinstall');
    runSidecarInitializeOnly(sidecar, 'update proxy reinstall');
    updatePass = true;

    uninstallMsi(productCode, 'Uninstall before rollback proxy');
    assertSidecarGone();

    installMsi(primaryMsi);
    sidecar = findInstalledSidecar();
    if (!sidecar) throw new Error('Sidecar missing after rollback proxy reinstall');
    runSidecarInitializeOnly(sidecar, 'rollback proxy reinstall');
    rollbackPass = true;

    uninstallMsi(productCode, 'Final uninstall');
    assertSidecarGone();
    uninstallPass = true;
  }

  return {
    vmId,
    installPass,
    updatePass,
    rollbackPass,
    uninstallPass,
    installerPath: primaryMsi,
    notes: notes.join(' '),
  };
}

function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    return 0;
  }

  if (process.platform !== 'win32') {
    console.error('DeferredFieldProof: installer VM capture requires Windows (win32).');
    console.error(`Current platform: ${process.platform}`);
    return 2;
  }

  const vmId = readArg('--vm-id');
  const installerPath = readArg('--installer-path');
  const resultOut = readArg('--result-out');
  const priorInstaller = readArg('--prior-installer');
  const currentInstaller = readArg('--current-installer');

  if (!vmId || !installerPath || !resultOut) {
    console.error('Missing required arguments.');
    printUsage();
    return 1;
  }

  let vmResult;
  try {
    vmResult = captureVmLifecycle({
      vmId,
      installerPath,
      priorInstaller,
      currentInstaller,
    });
  } catch (cause) {
    console.error(`VM ${vmId} capture failed: ${cause.message}`);
    return 1;
  }

  const allPass = vmResult.installPass && vmResult.updatePass
    && vmResult.rollbackPass && vmResult.uninstallPass;
  if (!allPass) {
    console.error(`VM ${vmId} did not pass full lifecycle — refusing to write PASS result`);
    return 1;
  }

  const outPath = resolve(resultOut);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify({
    ...vmResult,
    capturedAt: new Date().toISOString(),
  }, null, 2)}\n`, 'utf8');

  console.log(`Wrote VM result: ${outPath}`);
  console.log(JSON.stringify(vmResult, null, 2));
  return 0;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = { captureVmLifecycle, getMsiProductCode, findInstalledSidecar };
