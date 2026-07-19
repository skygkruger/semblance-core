#!/usr/bin/env node
'use strict';

/**
 * Accessibility gate — automated WCAG scan via axe-core + jsdom.
 *
 * Scans static landmark fixtures mirroring Chat / Proof / Settings shells and,
 * when present, Storybook static HTML. Fails on serious or critical violations.
 *
 * Task-based screen-reader review is tracked separately:
 *   release/evidence/a11y/task-based-checklist.md
 *
 * Usage:
 *   node scripts/a11y-gate.js
 *   node scripts/a11y-gate.js --json
 *
 * Exit: 0 pass, 1 fail
 */

const { readFileSync, readdirSync, statSync, existsSync } = require('node:fs');
const { join, relative, resolve } = require('node:path');
const { createRequire } = require('node:module');
const { JSDOM } = require('jsdom');

const ROOT = resolve(__dirname, '..');
const FIXTURE_DIR = join(ROOT, 'tests', 'fixtures', 'a11y');
const STORYBOOK_STATIC = join(ROOT, 'packages', 'semblance-ui', 'storybook-static');
const JSON_OUT = process.argv.includes('--json');

function loadAxeCore() {
  try {
    return require('axe-core');
  } catch {
    const pnpmDir = join(ROOT, 'node_modules', '.pnpm');
    const match = readdirSync(pnpmDir).find((entry) => entry.startsWith('axe-core@'));
    if (!match) {
      throw new Error('axe-core not installed — run pnpm install (pulled via @storybook/addon-a11y)');
    }
    const axePath = join(pnpmDir, match, 'node_modules', 'axe-core');
    return createRequire(__filename)(axePath);
  }
}

const axe = loadAxeCore();

const FAIL_IMPACT = new Set(['serious', 'critical']);

function collectHtmlFiles(dir) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      files.push(...collectHtmlFiles(abs));
    } else if (entry.endsWith('.html')) {
      files.push(abs);
    }
  }
  return files;
}

function runAxeOnHtml(html, label) {
  const dom = new JSDOM(html, {
    url: 'https://semblance.local/a11y-fixture',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  });
  dom.window.eval(axe.source);
  return new Promise((resolvePromise, rejectPromise) => {
    dom.window.axe.run(dom.window.document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    }, (err, results) => {
      if (err) {
        rejectPromise(new Error(`${label}: axe run failed — ${err.message}`));
        return;
      }
      const violations = (results.violations ?? []).filter(
        (v) => FAIL_IMPACT.has(v.impact),
      );
      resolvePromise({ label, violations, pass: violations.length === 0 });
    });
  });
}

async function scanFile(absPath) {
  const html = readFileSync(absPath, 'utf8');
  const label = relative(ROOT, absPath);
  return runAxeOnHtml(html, label);
}

async function main() {
  const targets = [
    ...collectHtmlFiles(FIXTURE_DIR),
    ...collectHtmlFiles(STORYBOOK_STATIC),
  ];

  if (targets.length === 0) {
    console.error('A11Y_GATE_FAIL: no HTML fixtures found to scan');
    return 1;
  }

  const results = [];
  for (const file of targets) {
    results.push(await scanFile(file));
  }

  const failed = results.filter((r) => !r.pass);
  const report = {
    gate: 'accessibility-automated',
    scanned: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    fixtures: FIXTURE_DIR,
    storybookStatic: existsSync(STORYBOOK_STATIC) ? STORYBOOK_STATIC : null,
    results: results.map((r) => ({
      file: r.label,
      pass: r.pass,
      violations: r.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        nodes: v.nodes.length,
      })),
    })),
  };

  if (JSON_OUT) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('\nAccessibility gate (axe-core + jsdom)');
    console.log(`Fixtures: ${FIXTURE_DIR}`);
    console.log(`Storybook static: ${report.storybookStatic ? 'included' : 'not built (skipped)'}`);
    console.log(`Scanned: ${report.scanned} file(s)`);
    for (const entry of report.results) {
      const icon = entry.pass ? 'PASS' : 'FAIL';
      console.log(`  ${icon}  ${entry.file}`);
      for (const v of entry.violations) {
        console.log(`        ${v.impact}: ${v.id} — ${v.description} (${v.nodes} node(s))`);
      }
    }
    console.log('');
    console.log(`Summary: ${report.passed} passed, ${report.failed} failed`);
    console.log('Task-based SR checklist: release/evidence/a11y/task-based-checklist.md');
  }

  return failed.length === 0 ? 0 : 1;
}

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((cause) => {
    console.error(`A11Y_GATE_ERROR: ${cause.message}`);
    process.exitCode = 1;
  });
}

module.exports = { runAxeOnHtml, collectHtmlFiles, FAIL_IMPACT };
