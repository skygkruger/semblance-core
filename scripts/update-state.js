#!/usr/bin/env node
/**
 * AUTO-PATCH SEMBLANCE_STATE.md
 *
 * Reads the latest verification output from .semblance-verify/latest.json
 * and patches the FEATURE VERIFICATION STATUS table in SEMBLANCE_STATE.md.
 *
 * Usage:
 *   node scripts/update-state.js                # Patch state from latest verify run
 *   node scripts/update-state.js --dry-run      # Show what would change without writing
 *
 * Designed to run after `node scripts/semblance-verify.js` (which writes latest.json).
 * Can also be chained: `node scripts/semblance-verify.js && node scripts/update-state.js`
 */

'use strict';

const { join } = require('path');
const { readFileSync, writeFileSync, existsSync } = require('fs');

const DRY_RUN = process.argv.includes('--dry-run');

const LATEST_FILE = join(__dirname, '..', '.semblance-verify', 'latest.json');
const STATE_FILE = join(
  __dirname, '..', '..', 'semblence-representative', 'docs', 'SEMBLANCE_STATE.md'
);

// ─── Feature name → display name mapping ────────────────────────────────────

const FEATURE_DISPLAY = {
  CHAT:    'Chat — response streams',
  PERSIST: 'Onboarding persists',
  CONNECT: 'Google Drive connect',
  GRAPH:   'Knowledge graph — no crash',
  FILES:   'File indexing — handler responds',
  EMAIL:   'Email fetch (IMAP)',
  CAL:     'Calendar fetch',
  REMIND:  'Reminders — create/list',
  WEB:     'Web search',
  PROACT:  'Proactive insights',
  BRIEF:   'Morning Brief',
  PRIVACY: 'Privacy/Audit trail',
};

// Map verify feature names to ALL rows they should update in the state table
const FEATURE_ROW_PATTERNS = {
  CHAT:    ['Chat —'],
  PERSIST: ['App launches', 'Onboarding persists', 'AI name persists'],
  CONNECT: ['Google Drive connect', 'Gmail connect'],
  GRAPH:   ['Knowledge graph'],
  FILES:   ['File indexing'],
  EMAIL:   ['Email fetch'],
  CAL:     ['Calendar fetch'],
  REMIND:  ['Reminders'],
  WEB:     ['Web search'],
  PROACT:  ['Proactive insights'],
  BRIEF:   ['Morning Brief'],
  PRIVACY: ['Privacy/Audit trail', 'Sovereignty report'],
};

// ─── Status mapping ─────────────────────────────────────────────────────────

function featureStatus(feature) {
  if (feature.fail > 0) return '❌';
  if (feature.warn > 0) return '⚠️';
  return '✅';
}

function statusNote(feature) {
  const parts = [];
  if (feature.fail > 0) {
    const failures = feature.tests
      .filter(t => t.status === 'FAIL')
      .map(t => t.detail || t.testName);
    parts.push(failures[0]?.slice(0, 60) || 'Failed');
  } else if (feature.warn > 0) {
    const warnings = feature.tests
      .filter(t => t.status === 'WARN')
      .map(t => t.detail || t.testName);
    parts.push(warnings[0]?.slice(0, 60) || 'Partial');
  } else {
    parts.push(`${feature.pass}/${feature.total} green`);
  }
  return parts.join('; ');
}

// ─── Table patching ─────────────────────────────────────────────────────────

function patchTable(stateContent, features, date) {
  const lines = stateContent.split('\n');
  const dateStr = date.slice(0, 10);
  let changed = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Only process table rows (start with |, not header separator)
    if (!line.startsWith('|') || line.startsWith('|--') || line.startsWith('| Feature')) continue;

    for (const [featureName, patterns] of Object.entries(FEATURE_ROW_PATTERNS)) {
      const feature = features.find(f => f.name === featureName);
      if (!feature) continue;

      const matchesRow = patterns.some(p => line.includes(p));
      if (!matchesRow) continue;

      // Parse existing row: | Feature | Status | Last Verified | Notes |
      const cells = line.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.length < 4) continue;

      const newStatus = featureStatus(feature);
      const newDate = `Session ${dateStr}`;
      const newNote = statusNote(feature);

      const newRow = `| ${cells[0]} | ${newStatus} | ${newDate} | ${newNote} |`;

      if (newRow !== line) {
        if (DRY_RUN) {
          console.log(`  WOULD UPDATE: ${cells[0]}`);
          console.log(`    OLD: ${line}`);
          console.log(`    NEW: ${newRow}`);
        }
        lines[i] = newRow;
        changed++;
      }
    }
  }

  return { content: lines.join('\n'), changed };
}

// ─── Velocity summary ───────────────────────────────────────────────────────

function velocitySummary(features) {
  const green = features.filter(f => f.fail === 0 && f.warn === 0).length;
  const yellow = features.filter(f => f.fail === 0 && f.warn > 0).length;
  const red = features.filter(f => f.fail > 0).length;
  const totalPass = features.reduce((s, f) => s + f.pass, 0);
  const totalTests = features.reduce((s, f) => s + f.total, 0);
  return { green, yellow, red, totalPass, totalTests };
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  if (!existsSync(LATEST_FILE)) {
    console.error('ERROR: No verification data found at', LATEST_FILE);
    console.error('Run `node scripts/semblance-verify.js` first.');
    process.exit(1);
  }

  if (!existsSync(STATE_FILE)) {
    console.error('ERROR: SEMBLANCE_STATE.md not found at', STATE_FILE);
    console.error('Expected in semblence-representative/docs/');
    process.exit(1);
  }

  const report = JSON.parse(readFileSync(LATEST_FILE, 'utf8'));
  const stateContent = readFileSync(STATE_FILE, 'utf8');

  console.log(`\n  update-state.js — patching from verify run: ${report.date}`);
  console.log(`  Features in report: ${report.allFeatures.length}`);

  const { content: patched, changed } = patchTable(stateContent, report.allFeatures, report.date);

  // Update the "Last Updated" line
  const today = new Date().toISOString().slice(0, 10);
  const finalContent = patched
    .replace(/\*\*Last Updated:\*\* .+/, `**Last Updated:** ${today}`)
    .replace(/\*\*Updated By:\*\* .+/, `**Updated By:** update-state.js (automated)`);

  const vel = velocitySummary(report.allFeatures);
  console.log(`\n  Velocity: ${vel.green} green, ${vel.yellow} yellow, ${vel.red} red`);
  console.log(`  Assertions: ${vel.totalPass}/${vel.totalTests} passing`);
  console.log(`  P0 Gate: ${report.p0Pass ? 'PASS' : 'FAIL'}`);
  console.log(`  Rows updated: ${changed}`);

  if (DRY_RUN) {
    console.log('\n  --dry-run: No files modified.\n');
    return;
  }

  if (changed > 0 || finalContent !== stateContent) {
    writeFileSync(STATE_FILE, finalContent);
    console.log(`\n  SEMBLANCE_STATE.md updated (${changed} rows patched).`);
  } else {
    console.log('\n  No changes needed — state already matches verify output.');
  }

  // Print summary for easy copy into session log
  console.log('\n  ── Velocity snippet for session log ──');
  console.log(`  Features moved to ✅: ${vel.green}`);
  console.log(`  Features at ⚠️: ${vel.yellow}`);
  console.log(`  Features at ❌: ${vel.red}`);
  console.log(`  P0 remaining: ${report.allFeatures.filter(f => ['CHAT','PERSIST','CONNECT','GRAPH','FILES'].includes(f.name) && f.fail > 0).length}/5`);
  console.log(`  Assertions: ${vel.totalPass}/${vel.totalTests}`);
  console.log();
}

main();
