// Serialized privacy audit runner — prevents concurrent executions
// that cause flaky failures when multiple test files spawn the script.

import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync, writeFileSync, unlinkSync, readFileSync, openSync, closeSync, mkdirSync } from 'node:fs';
import { constants } from 'node:fs';

const ROOT = join(__dirname, '..', '..');
const VERIFY_DIR = join(ROOT, '.semblance-verify');
const LOCK_FILE = join(VERIFY_DIR, 'privacy-audit.lock');
const CACHE_FILE = join(VERIFY_DIR, 'privacy-audit-cache.json');
const CACHE_TTL_MS = 120_000; // 2 minutes — cache result for entire test run

/**
 * Run the privacy audit script with file-level serialization.
 * Caches result for 2 minutes so the script runs at most once per test suite.
 */
export function runPrivacyAudit(): string {
  // Ensure verify dir exists
  if (!existsSync(VERIFY_DIR)) {
    try { mkdirSync(VERIFY_DIR, { recursive: true }); } catch { /* ignore */ }
  }

  // Check cache first — if valid, return immediately (no lock needed)
  try {
    if (existsSync(CACHE_FILE)) {
      const cached = JSON.parse(readFileSync(CACHE_FILE, 'utf-8')) as { output: string; timestamp: number };
      if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.output;
      }
    }
  } catch { /* stale or corrupt — run fresh */ }

  // Acquire exclusive lock using O_CREAT|O_EXCL (atomic on all platforms)
  let gotLock = false;
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    try {
      const fd = openSync(LOCK_FILE, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY);
      closeSync(fd);
      gotLock = true;
      break;
    } catch {
      // Lock held by another process — check if cache appeared while waiting
      try {
        if (existsSync(CACHE_FILE)) {
          const cached = JSON.parse(readFileSync(CACHE_FILE, 'utf-8')) as { output: string; timestamp: number };
          if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
            return cached.output;
          }
        }
      } catch { /* ignore */ }

      // Spin 200ms
      const start = Date.now();
      while (Date.now() - start < 200) { /* spin */ }
    }
  }

  // Stale lock fallback — force acquire
  if (!gotLock) {
    try { unlinkSync(LOCK_FILE); } catch { /* ignore */ }
    try {
      const fd = openSync(LOCK_FILE, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY);
      closeSync(fd);
    } catch { /* proceed anyway */ }
  }

  try {
    const output = execSync('node scripts/privacy-audit/index.js', {
      cwd: ROOT,
      encoding: 'utf-8',
      timeout: 30000,
    });

    // Cache result for other concurrent callers
    try {
      writeFileSync(CACHE_FILE, JSON.stringify({ output, timestamp: Date.now() }));
    } catch { /* best effort */ }

    return output;
  } finally {
    try { unlinkSync(LOCK_FILE); } catch { /* ignore */ }
  }
}
