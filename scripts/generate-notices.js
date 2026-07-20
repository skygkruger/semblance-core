#!/usr/bin/env node
'use strict';

/**
 * Generate THIRD_PARTY_NOTICES.md aligned with release-manifest legalNoticesVersion.
 *
 * Reads release/sbom/semblance.cdx.json when present; otherwise regenerates SBOM.
 * Output: release/legal/THIRD_PARTY_NOTICES.md
 *
 * Usage:
 *   node scripts/generate-notices.js
 */

const { readFileSync, writeFileSync, mkdirSync, existsSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { buildSbom, OUT_FILE: SBOM_PATH } = require('./generate-sbom.js');

const ROOT = resolve(__dirname, '..');
const OUT_DIR = join(ROOT, 'release', 'legal');
const OUT_FILE = join(OUT_DIR, 'THIRD_PARTY_NOTICES.md');

function loadSbom() {
  if (existsSync(SBOM_PATH)) {
    return JSON.parse(readFileSync(SBOM_PATH, 'utf8'));
  }
  return buildSbom();
}

function groupByLicense(components) {
  const groups = new Map();
  for (const component of components) {
    const license = component.license || 'UNKNOWN';
    if (!groups.has(license)) groups.set(license, []);
    groups.get(license).push(component);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function renderNotices(sbom) {
  const legalVersion = sbom.metadata.properties.find(
    (p) => p.name === 'legalNoticesVersion',
  )?.value ?? 'unversioned';
  const lines = [];
  lines.push('# Third Party Notices');
  lines.push('');
  lines.push(`Version: ${legalVersion}`);
  lines.push(`Generated: ${sbom.metadata.timestamp}`);
  lines.push(`Release: ${sbom.metadata.component.version}`);
  lines.push('');
  lines.push('Semblance ships third-party open-source components. This file summarizes');
  lines.push('dependency names, versions, and SPDX license identifiers represented in the');
  lines.push('CycloneDX-lite SBOM at `release/sbom/semblance.cdx.json`.');
  lines.push('');
  lines.push('Desktop Rust crate licenses are recorded in `Cargo.lock` and summarized');
  lines.push('under the cargo ecosystem section of the SBOM.');
  lines.push('');

  for (const [license, components] of groupByLicense(sbom.components)) {
    lines.push(`## ${license}`);
    lines.push('');
    for (const component of components.sort((a, b) => a.name.localeCompare(b.name))) {
      const eco = component.ecosystem ?? 'npm';
      lines.push(`- \`${component.name}@${component.version}\` (${eco})`);
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function main() {
  const sbom = loadSbom();
  const markdown = renderNotices(sbom);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, markdown);
  console.log(`Third-party notices written: ${OUT_FILE}`);
  console.log(`  legalNoticesVersion: ${sbom.metadata.properties.find((p) => p.name === 'legalNoticesVersion')?.value}`);
  console.log(`  components: ${sbom.components.length}`);
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (cause) {
    console.error(`NOTICES_GENERATION_FAILED: ${cause.message}`);
    process.exitCode = 1;
  }
}

module.exports = { renderNotices, OUT_FILE };
