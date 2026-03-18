/**
 * CHECKPOINT — Mid-session progress logger
 *
 * Logs a progress marker to the session log that survives compaction.
 * Use this to record what you've done so far in a long session.
 *
 * Usage:
 *   node scripts/checkpoint.js "Description of what was done"
 *   node scripts/checkpoint.js --read     # Read all checkpoints this session
 *
 * Exit code: 0 always
 */

'use strict';

const { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } = require('fs');
const { join } = require('path');

const ROOT = join(__dirname, '..');
const STATE_DIR = join(ROOT, '.semblance-verify');
const SESSION_LOG_FILE = join(STATE_DIR, 'session-log.ndjson');

if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });

const READ_MODE = process.argv.includes('--read');

if (READ_MODE) {
  // Read and display all checkpoints
  if (!existsSync(SESSION_LOG_FILE)) {
    console.log('No checkpoints logged this session.');
    process.exit(0);
  }
  const content = readFileSync(SESSION_LOG_FILE, 'utf8').trim();
  if (!content) {
    console.log('No checkpoints logged this session.');
    process.exit(0);
  }
  const entries = content.split('\n').map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const checkpoints = entries.filter(e => e.type === 'checkpoint');
  if (checkpoints.length === 0) {
    console.log('No checkpoints logged this session.');
    process.exit(0);
  }
  console.log(`\n  Session checkpoints (${checkpoints.length}):\n`);
  checkpoints.forEach((c, i) => {
    const time = c.timestamp ? c.timestamp.slice(11, 19) : '?';
    console.log(`  ${i + 1}. [${time}] ${c.message}`);
  });
  console.log('');
  process.exit(0);
}

// Write a checkpoint
const message = process.argv.slice(2).filter(a => !a.startsWith('--')).join(' ').trim();

if (!message) {
  console.error('Usage: node scripts/checkpoint.js "Description"');
  process.exit(1);
}

const entry = {
  type: 'checkpoint',
  timestamp: new Date().toISOString(),
  message,
};

appendFileSync(SESSION_LOG_FILE, JSON.stringify(entry) + '\n', 'utf8');
console.log(`  ✅ Checkpoint #${Date.now()}: ${message}`);
