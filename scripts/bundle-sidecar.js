#!/usr/bin/env node
// Bundle the sidecar bridge.ts into a production-ready bridge.cjs
// and copy native Node modules + ALL transitive deps alongside it.
//
// Called by tauri.conf.json beforeBuildCommand.

const { execSync } = require('child_process');
const { cpSync, mkdirSync, existsSync, rmSync, readFileSync } = require('fs');
const { join, resolve } = require('path');

const ROOT = resolve(__dirname, '..');
const SIDECAR_DIR = join(ROOT, 'packages', 'desktop', 'src-tauri', 'sidecar');
const SIDECAR_MODULES = join(SIDECAR_DIR, 'node_modules');
const ROOT_MODULES = join(ROOT, 'node_modules');

console.log('[bundle-sidecar] Bundling bridge.ts → bridge.cjs...');

execSync(
  [
    'node', join(ROOT, 'node_modules', 'esbuild', 'bin', 'esbuild'),
    join(SIDECAR_DIR, 'bridge.ts'),
    '--bundle',
    '--platform=node',
    '--target=node20',
    '--format=cjs',
    `--outfile=${join(SIDECAR_DIR, 'bridge.cjs')}`,
    '--external:better-sqlite3',
    '--external:@lancedb/lancedb',
    '--external:@lancedb/lancedb-win32-x64-msvc',
    '--external:apache-arrow',
  ].join(' '),
  { cwd: ROOT, stdio: 'inherit' }
);

console.log('[bundle-sidecar] Resolving all transitive dependencies...');

// Recursively find ALL dependencies of the external modules
function getAllDeps(pkg, visited = new Set()) {
  if (visited.has(pkg)) return visited;
  visited.add(pkg);
  const pkgJsonPath = join(ROOT_MODULES, pkg, 'package.json');
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
  const src = join(ROOT_MODULES, mod);
  const dest = join(SIDECAR_MODULES, mod);
  if (existsSync(src)) {
    // Ensure parent dir exists for scoped packages (@lancedb/lancedb)
    const parentDir = join(dest, '..');
    if (!existsSync(parentDir)) mkdirSync(parentDir, { recursive: true });
    cpSync(src, dest, { recursive: true, dereference: true });
    copied++;
  } else {
    console.warn(`  WARN: ${mod} not found at ${src}`);
  }
}

console.log(`[bundle-sidecar] Copied ${copied} packages to sidecar/node_modules`);
console.log('[bundle-sidecar] Done.');
