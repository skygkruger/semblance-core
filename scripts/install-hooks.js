/**
 * Install git hooks from scripts/hooks/ into .git/hooks/
 *
 * Usage: node scripts/install-hooks.js
 *
 * Safe to re-run — overwrites existing hooks from this repo only.
 */

'use strict';

const { copyFileSync, chmodSync, readdirSync, existsSync } = require('fs');
const { join } = require('path');

const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'scripts', 'hooks');
const DEST = join(ROOT, '.git', 'hooks');

if (!existsSync(SRC)) {
  console.log('No hooks directory at scripts/hooks/ — nothing to install.');
  process.exit(0);
}

const hooks = readdirSync(SRC).filter(f => !f.startsWith('.'));

for (const hook of hooks) {
  const src = join(SRC, hook);
  const dest = join(DEST, hook);
  copyFileSync(src, dest);
  chmodSync(dest, 0o755);
  console.log(`  ✅ Installed: ${hook}`);
}

console.log(`\n  ${hooks.length} hook(s) installed to .git/hooks/`);
