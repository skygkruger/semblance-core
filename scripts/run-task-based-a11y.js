#!/usr/bin/env node
'use strict';

/**
 * Task-based accessibility automation for landmark fixtures.
 *
 * Runs keyboard-order, skip-link, landmark, and ARIA label checks via jsdom.
 * VoiceOver/NVDA items remain unchecked — this does NOT claim full FieldProven SR pass.
 *
 * Usage:
 *   node scripts/run-task-based-a11y.js [--out release/evidence/a11y/task-based-executed.md]
 *
 * Exit: 0 report written, 1 automated check failure
 */

const { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } = require('node:fs');
const { join, resolve, dirname, basename } = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = resolve(__dirname, '..');
const FIXTURE_DIR = join(ROOT, 'tests', 'fixtures', 'a11y');
const DEFAULT_OUT = join(ROOT, 'release', 'evidence', 'a11y', 'task-based-executed.md');
const MANIFEST_PATH = join(ROOT, 'release', 'release-manifest.json');

function readArg(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return fallback;
  return process.argv[idx + 1];
}

function printUsage() {
  console.log(`Usage: node scripts/run-task-based-a11y.js [--out <markdown-path>]

Automates fixture checks under tests/fixtures/a11y/*.html.
Manual VoiceOver/NVDA checklist items are listed unchecked in the report.`);
}

function loadReleaseId() {
  if (!existsSync(MANIFEST_PATH)) return 'unknown-release';
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')).releaseId;
}

function collectHtmlFixtures() {
  if (!existsSync(FIXTURE_DIR)) return [];
  return readdirSync(FIXTURE_DIR).filter((name) => name.endsWith('.html')).map((name) => join(FIXTURE_DIR, name));
}

function isFocusable(el) {
  const tag = el.tagName.toLowerCase();
  if (tag === 'a' && el.getAttribute('href')) return true;
  if (tag === 'button' && !el.disabled) return true;
  if (tag === 'textarea' && !el.disabled) return true;
  if (tag === 'input' && !el.disabled && el.type !== 'hidden') return true;
  const tabIndex = el.getAttribute('tabindex');
  return tabIndex !== null && Number.parseInt(tabIndex, 10) >= 0;
}

function getFocusableElements(document) {
  return Array.from(document.body.querySelectorAll('*')).filter(isFocusable);
}

function runFixtureChecks(htmlPath) {
  const label = basename(htmlPath, '.html');
  const html = readFileSync(htmlPath, 'utf8');
  const dom = new JSDOM(html, { url: 'https://semblance.local/a11y-fixture' });
  const { document } = dom.window;
  const failures = [];
  const passes = [];

  const skipLink = document.querySelector('a.skip-link, a[href^="#"]');
  if (!skipLink) failures.push('missing skip link');
  else {
    passes.push('skip link present');
    const targetId = (skipLink.getAttribute('href') || '').replace(/^#/, '');
    if (!targetId || !document.getElementById(targetId)) failures.push('skip link target missing');
    else passes.push('skip link target exists');
  }

  const banner = document.querySelector('[role="banner"], header');
  const main = document.querySelector('main, [role="main"]');
  if (!banner) failures.push('missing banner landmark');
  else passes.push('banner landmark present');
  if (!main) failures.push('missing main landmark');
  else passes.push('main landmark present');

  const primaryNav = document.querySelector('nav[aria-label="Primary"], nav');
  if (!primaryNav) failures.push('missing primary nav');
  else passes.push('primary navigation present');

  const currentPage = primaryNav?.querySelector('[aria-current="page"]');
  if (currentPage) passes.push('current page marked with aria-current');

  const labels = document.querySelectorAll('label[for]');
  for (const labelEl of labels) {
    const input = document.getElementById(labelEl.getAttribute('for'));
    if (!input) failures.push(`label for="${labelEl.getAttribute('for')}" has no matching input`);
  }
  if (labels.length > 0 && failures.every((f) => !f.startsWith('label for='))) {
    passes.push('label/input associations present');
  }

  const liveRegion = document.querySelector('[aria-live]');
  if (liveRegion) passes.push('live region present');

  const table = document.querySelector('table');
  if (table) {
    if (!table.querySelector('caption')) failures.push('table missing caption');
    else passes.push('table caption present');
    const headers = table.querySelectorAll('th');
    if (headers.length === 0) failures.push('table missing column headers');
    else passes.push('table column headers present');
  }

  const focusables = getFocusableElements(document);
  if (focusables.length === 0) failures.push('no focusable elements found');
  else passes.push(`focusable elements discovered (${focusables.length})`);

  const tabOrderTags = focusables.map((el) => el.tagName.toLowerCase());
  if (tabOrderTags.includes('a') && (tabOrderTags.includes('textarea') || tabOrderTags.includes('input'))) {
    passes.push('keyboard tab order includes nav/input controls');
  }

  return { label, passes, failures };
}

function buildReport(results, releaseId) {
  const date = new Date().toISOString().slice(0, 10);
  const lines = [
    '# Task-Based Accessibility — Automated Execution',
    '',
    `Release ID: ${releaseId}`,
    `Generated: ${new Date().toISOString()}`,
    '',
    '> Automated fixture checks only. VoiceOver/NVDA manual review is still required for full FieldProven SR pass.',
    '',
    '## Automated checks (fixtures)',
    '',
  ];

  let automatedFail = false;
  for (const result of results) {
    lines.push(`### ${result.label}`);
    for (const pass of result.passes) lines.push(`- [x] ${pass}`);
    for (const fail of result.failures) {
      lines.push(`- [ ] FAIL: ${fail}`);
      automatedFail = true;
    }
    lines.push('');
  }

  lines.push('## Manual screen-reader checklist (not automated)');
  lines.push('');
  lines.push('- [ ] VoiceOver (macOS) or NVDA/JAWS (Windows) browse mode validates Chat workflow');
  lines.push('- [ ] Proof Center table values readable in screen-reader browse mode');
  lines.push('- [ ] Settings section nav announces current section');
  lines.push('- [ ] Offline proof inspection with network disabled (manual step)');
  lines.push('- [ ] No keyboard traps in production desktop build');
  lines.push('');
  lines.push('## Verdict');
  lines.push('');
  lines.push(automatedFail
    ? '- Automated fixture checks: **FAIL** (see unchecked items above)'
    : '- Automated fixture checks: **PASS**');
  lines.push('- Full FieldProven screen-reader pass: **NOT CLAIMED** (manual items unchecked)');
  lines.push('');
  lines.push(`Reference checklist template: release/evidence/a11y/task-based-checklist.md`);
  lines.push(`Fixture directory: tests/fixtures/a11y/`);
  lines.push('');

  return { markdown: lines.join('\n'), automatedFail, date };
}

function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    return 0;
  }

  const outArg = readArg('--out');
  const fixtures = collectHtmlFixtures();
  if (fixtures.length === 0) {
    console.error(`No HTML fixtures found in ${FIXTURE_DIR}`);
    return 1;
  }

  const results = fixtures.map(runFixtureChecks);
  const { markdown, automatedFail, date } = buildReport(results, loadReleaseId());
  const outPath = resolve(outArg || join(ROOT, 'release', 'evidence', 'a11y', `task-based-${date}.md`));

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, markdown, 'utf8');
  console.log(`Wrote task-based a11y report: ${outPath}`);

  if (automatedFail) {
    console.error('One or more automated fixture checks failed.');
    return 1;
  }
  return 0;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = { runFixtureChecks, buildReport };
