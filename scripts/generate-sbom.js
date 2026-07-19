#!/usr/bin/env node
'use strict';

/**
 * Generate a CycloneDX-lite SBOM from pnpm-lock.yaml + desktop Cargo.lock.
 *
 * Output: release/sbom/semblance.cdx.json
 *
 * Usage:
 *   node scripts/generate-sbom.js
 *   node scripts/generate-sbom.js --stdout
 */

const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } = require('node:fs');
const { join, resolve } = require('node:path');

const ROOT = resolve(__dirname, '..');
const OUT_DIR = join(ROOT, 'release', 'sbom');
const OUT_FILE = join(OUT_DIR, 'semblance.cdx.json');
const PNPM_LOCK = join(ROOT, 'pnpm-lock.yaml');
const CARGO_LOCK = join(ROOT, 'packages', 'desktop', 'src-tauri', 'Cargo.lock');
const STDOUT = process.argv.includes('--stdout');

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function readManifestVersion() {
  const manifestPath = join(ROOT, 'release', 'release-manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return {
    releaseId: manifest.releaseId,
    legalNoticesVersion: manifest.legalNoticesVersion,
  };
}

function readInstalledLicense(name, version) {
  const pnpmDir = join(ROOT, 'node_modules', '.pnpm');
  if (!existsSync(pnpmDir)) return 'UNKNOWN';

  const scoped = name.startsWith('@');
  const prefix = scoped
    ? `${name.replace('/', '+')}@${version}`
    : `${name}@${version}`;
  const candidates = readdirSync(pnpmDir).filter((entry) => entry.startsWith(`${prefix}`));
  for (const entry of candidates) {
    const pkgJsonPath = scoped
      ? join(pnpmDir, entry, 'node_modules', name.split('/')[0], name.split('/')[1], 'package.json')
      : join(pnpmDir, entry, 'node_modules', name, 'package.json');
    if (!existsSync(pkgJsonPath)) continue;
    try {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
      if (typeof pkg.license === 'string') return pkg.license;
      if (pkg.license && typeof pkg.license === 'object' && pkg.license.type) return pkg.license.type;
    } catch {
      continue;
    }
  }
  return 'UNKNOWN';
}

function parsePnpmLockPackages() {
  const text = readFileSync(PNPM_LOCK, 'utf8');
  const lines = text.split('\n');
  const components = [];
  let inPackages = false;

  for (const line of lines) {
    if (line === 'packages:') {
      inPackages = true;
      continue;
    }
    if (!inPackages) continue;
    if (/^[a-z]/i.test(line)) break;

    const match = line.match(/^  ('?)([^']+?)\1:$/);
    if (!match) continue;
    const key = match[2];
    const at = key.lastIndexOf('@');
    if (at <= 0) continue;
    const name = key.slice(0, at);
    const version = key.slice(at + 1);
    components.push({
      type: 'library',
      name,
      version,
      purl: `pkg:npm/${encodeURIComponent(name)}@${version}`,
      ecosystem: 'npm',
      license: readInstalledLicense(name, version),
    });
  }

  return components.sort((a, b) => a.name.localeCompare(b.name));
}

function parseCargoLock() {
  if (!existsSync(CARGO_LOCK)) return [];
  const text = readFileSync(CARGO_LOCK, 'utf8');
  const components = [];
  let current = null;

  for (const line of text.split('\n')) {
    if (line === '[[package]]') {
      if (current) components.push(current);
      current = null;
      continue;
    }
    const nameMatch = line.match(/^name = "(.+)"$/);
    const versionMatch = line.match(/^version = "(.+)"$/);
    if (nameMatch) current = { name: nameMatch[1] };
    if (versionMatch && current) current.version = versionMatch[1];
  }
  if (current) components.push(current);

  return components
    .filter((entry) => entry.name && entry.version)
    .map((entry) => ({
      type: 'library',
      name: entry.name,
      version: entry.version,
      purl: `pkg:cargo/${entry.name}@${entry.version}`,
      ecosystem: 'cargo',
      license: 'registry-crate',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildSbom() {
  const context = readManifestVersion();
  const npmComponents = parsePnpmLockPackages();
  const cargoComponents = parseCargoLock();
  const generatedAt = new Date().toISOString();
  const components = [...npmComponents, ...cargoComponents];

  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5-lite',
    serialNumber: `urn:uuid:semblance-sbom-${sha256(`${context.releaseId}:${generatedAt}`).slice(0, 32)}`,
    version: 1,
    metadata: {
      timestamp: generatedAt,
      component: {
        type: 'application',
        name: 'semblance-core',
        version: context.releaseId,
      },
      properties: [
        { name: 'legalNoticesVersion', value: context.legalNoticesVersion },
        { name: 'generator', value: 'scripts/generate-sbom.js' },
      ],
    },
    components,
    summary: {
      npmPackages: npmComponents.length,
      cargoCrates: cargoComponents.length,
      total: components.length,
    },
  };
}

function main() {
  const sbom = buildSbom();
  const json = `${JSON.stringify(sbom, null, 2)}\n`;

  if (STDOUT) {
    process.stdout.write(json);
    return 0;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, json);
  console.log(`SBOM written: ${OUT_FILE}`);
  console.log(`  npm packages: ${sbom.summary.npmPackages}`);
  console.log(`  cargo crates: ${sbom.summary.cargoCrates}`);
  console.log(`  total:        ${sbom.summary.total}`);
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (cause) {
    console.error(`SBOM_GENERATION_FAILED: ${cause.message}`);
    process.exitCode = 1;
  }
}

module.exports = { buildSbom, parsePnpmLockPackages, parseCargoLock, OUT_FILE };
