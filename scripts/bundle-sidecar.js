#!/usr/bin/env node
// Bundle the sidecar bridge.ts into a production-ready bridge.cjs
// and copy native Node modules + ALL transitive deps alongside it.
//
// Called by tauri.conf.json beforeBuildCommand.

const { execSync } = require('child_process');
const { cpSync, mkdirSync, mkdtempSync, existsSync, rmSync, readFileSync } = require('fs');
const { tmpdir } = require('os');
const { join, resolve } = require('path');

const ROOT = resolve(__dirname, '..');
const SIDECAR_DIR = join(ROOT, 'packages', 'desktop', 'src-tauri', 'sidecar');
const SIDECAR_MODULES = join(SIDECAR_DIR, 'node_modules');
const ROOT_MODULES = join(ROOT, 'node_modules');
// pnpm places workspace deps in package-local node_modules; check there as fallback
const CORE_MODULES = join(ROOT, 'packages', 'core', 'node_modules');
const TRACKED_BUNDLE = join(SIDECAR_DIR, 'bridge.cjs');
const CHECK_ONLY = process.argv.includes('--check');
const checkDir = CHECK_ONLY
  ? mkdtempSync(join(tmpdir(), 'semblance-sidecar-check-'))
  : null;
const outputPath = checkDir ? join(checkDir, 'bridge.cjs') : TRACKED_BUNDLE;

function findModuleDir(mod) {
  const rootPath = join(ROOT_MODULES, mod);
  if (existsSync(rootPath)) return rootPath;
  const corePath = join(CORE_MODULES, mod);
  if (existsSync(corePath)) return corePath;
  // pnpm virtual store: @scope/name is stored as @scope+name@version/node_modules/@scope/name
  const pnpmBase = join(ROOT_MODULES, '.pnpm');
  if (existsSync(pnpmBase)) {
    const prefix = mod.replace('/', '+');
    try {
      const entries = require('fs').readdirSync(pnpmBase);
      const match = entries.find(e => e.startsWith(prefix + '@'));
      if (match) {
        const candidate = join(pnpmBase, match, 'node_modules', mod);
        if (existsSync(candidate)) return candidate;
      }
    } catch (_) {}
  }
  return null;
}

console.log(`[bundle-sidecar] ${CHECK_ONLY ? 'Checking' : 'Bundling'} bridge.ts → bridge.cjs...`);

execSync(
  [
    join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'esbuild.CMD' : 'esbuild'),
    join(SIDECAR_DIR, 'bridge.ts'),
    '--bundle',
    '--platform=node',
    '--target=node20',
    '--format=cjs',
    `--outfile=${outputPath}`,
    '--external:better-sqlite3',
    '--external:@lancedb/lancedb',
    '--external:@lancedb/lancedb-win32-x64-msvc',
    '--external:apache-arrow',
  ].join(' '),
  { cwd: ROOT, stdio: 'inherit' }
);

if (CHECK_ONLY) {
  const forbiddenSymbols = [
    'activateFoundingMember',
    'license:activate_founding',
  ];
  try {
    if (!existsSync(TRACKED_BUNDLE)) {
      throw new Error('Tracked bridge.cjs is missing; run node scripts/bundle-sidecar.js');
    }
    const expected = readFileSync(outputPath);
    const tracked = readFileSync(TRACKED_BUNDLE);
    if (!expected.equals(tracked)) {
      throw new Error(
        'Tracked bridge.cjs is stale; run node scripts/bundle-sidecar.js and commit it',
      );
    }
    const bundleText = tracked.toString('utf8');
    const forbidden = forbiddenSymbols.filter((symbol) => bundleText.includes(symbol));
    if (forbidden.length > 0) {
      throw new Error(
        `Tracked bridge.cjs contains removed premium activation symbols: ${forbidden.join(', ')}`,
      );
    }
    if (!bundleText.includes('reservation:import')) {
      throw new Error('Tracked bridge.cjs is missing reservation-only import handling');
    }
    console.log('[bundle-sidecar] PASS: tracked bundle is current and reservation-only');
  } finally {
    rmSync(checkDir, { recursive: true, force: true });
  }
  process.exit(0);
}

console.log('[bundle-sidecar] Resolving all transitive dependencies...');

// Recursively find ALL dependencies of the external modules
function getAllDeps(pkg, visited = new Set()) {
  if (visited.has(pkg)) return visited;
  visited.add(pkg);
  const modDir = findModuleDir(pkg);
  if (!modDir) return visited;
  const pkgJsonPath = join(modDir, 'package.json');
  if (!existsSync(pkgJsonPath)) return visited;
  try {
    const p = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
    const deps = { ...p.dependencies, ...p.optionalDependencies };
    for (const dep of Object.keys(deps)) {
      getAllDeps(dep, visited);
    }
  } catch (e) {
    // Skip unreadable package.json
  }
  return visited;
}

const allDeps = new Set();
for (const root of ['@lancedb/lancedb', 'apache-arrow', 'better-sqlite3']) {
  getAllDeps(root, allDeps);
}

console.log(`[bundle-sidecar] Found ${allDeps.size} packages to copy`);

// Clean and recreate target
if (existsSync(SIDECAR_MODULES)) {
  rmSync(SIDECAR_MODULES, { recursive: true, force: true });
}
mkdirSync(SIDECAR_MODULES, { recursive: true });

// Copy each dependency
let copied = 0;
for (const mod of [...allDeps].sort()) {
  const src = findModuleDir(mod);
  const dest = join(SIDECAR_MODULES, mod);
  if (src) {
    // Ensure parent dir exists for scoped packages (@lancedb/lancedb)
    const parentDir = join(dest, '..');
    if (!existsSync(parentDir)) mkdirSync(parentDir, { recursive: true });
    cpSync(src, dest, { recursive: true, dereference: true });
    copied++;
  } else {
    console.warn(`  WARN: ${mod} not found in root or workspace node_modules`);
  }
}

console.log(`[bundle-sidecar] Copied ${copied} packages to sidecar/node_modules`);

// Copy .env into sidecar directory if it exists at the repo root.
// The installed app runs from a different directory than the repo,
// so the sidecar can't find .env via __dirname relative paths.
// This ensures OAuth credentials are available in the bundled build.
const envSrcSidecar = join(SIDECAR_DIR, '.env');
const envSrcRoot = join(ROOT, '.env');
const envDest = join(SIDECAR_DIR, '.env');
const envSrc = existsSync(envSrcSidecar) ? envSrcSidecar : existsSync(envSrcRoot) ? envSrcRoot : null;
if (envSrc && envSrc !== envDest) {
  cpSync(envSrc, envDest);
  console.log(`[bundle-sidecar] Copied .env from ${envSrc} into sidecar directory`);
} else if (envSrc) {
  console.log('[bundle-sidecar] .env already in sidecar directory');
} else {
  console.warn('[bundle-sidecar] No .env found at sidecar dir or repo root — OAuth credentials will need to be at ~/.semblance/.env');
}

console.log('[bundle-sidecar] Done.');
