#!/usr/bin/env node

/**
 * Semblance Privacy Audit
 *
 * Scans all TypeScript, JavaScript, and Rust files under packages/core/
 * for imports of banned network modules. The AI Core must NEVER have
 * network capability. Any violation is a critical security incident.
 *
 * Exit code 0: Clean — no violations found.
 * Exit code 1: Violations found — merge must be blocked.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const CORE_DIR = join(__dirname, '..', '..', 'packages', 'core');

// Banned network modules for TypeScript/JavaScript
const BANNED_JS_PATTERNS = [
  // Built-in Node.js networking
  /\bimport\b.*['"](?:node:)?(?:http|https|net|dgram|dns|tls)['"]/,
  /\brequire\s*\(\s*['"](?:node:)?(?:http|https|net|dgram|dns|tls)['"]\s*\)/,
  // Third-party HTTP libraries
  /\bimport\b.*['"](?:axios|got|node-fetch|undici|superagent)['"]/,
  /\brequire\s*\(\s*['"](?:axios|got|node-fetch|undici|superagent)['"]\s*\)/,
  // WebSocket libraries
  /\bimport\b.*['"](?:socket\.io|ws)['"]/,
  /\brequire\s*\(\s*['"](?:socket\.io|ws)['"]\s*\)/,
  // Global network APIs
  /\bfetch\s*\(/,
  /\bnew\s+XMLHttpRequest\b/,
  /\bnew\s+WebSocket\b/,
];

// Banned network crates for Rust
const BANNED_RUST_PATTERNS = [
  /\buse\s+reqwest\b/,
  /\buse\s+hyper\b/,
  /\buse\s+tokio::net\b/,
  /\buse\s+std::net\b/,
  /\bextern\s+crate\s+reqwest\b/,
  /\bextern\s+crate\s+hyper\b/,
];

// Human-readable names for violations
const PATTERN_NAMES_JS = [
  'Node.js http/https/net/dgram/dns/tls import',
  'Node.js http/https/net/dgram/dns/tls require',
  'Third-party HTTP library import (axios/got/node-fetch/undici/superagent)',
  'Third-party HTTP library require (axios/got/node-fetch/undici/superagent)',
  'WebSocket library import (socket.io/ws)',
  'WebSocket library require (socket.io/ws)',
  'fetch() call',
  'XMLHttpRequest usage',
  'WebSocket constructor',
];

const PATTERN_NAMES_RUST = [
  'Rust reqwest crate usage',
  'Rust hyper crate usage',
  'Rust tokio::net usage',
  'Rust std::net usage',
  'Rust reqwest extern crate',
  'Rust hyper extern crate',
];

function collectFiles(dir, extensions) {
  const files = [];
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          if (entry === 'node_modules' || entry === 'dist' || entry === 'build') continue;
          files.push(...collectFiles(fullPath, extensions));
        } else if (extensions.some(ext => entry.endsWith(ext))) {
          files.push(fullPath);
        }
      } catch {
        // Skip inaccessible files
      }
    }
  } catch {
    // Directory doesn't exist yet — that's fine during scaffolding
  }
  return files;
}

function scanFile(filePath, patterns, patternNames) {
  const violations = [];
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let p = 0; p < patterns.length; p++) {
      if (patterns[p].test(line)) {
        violations.push({
          file: filePath,
          line: i + 1,
          content: line.trim(),
          violation: patternNames[p],
        });
      }
    }
  }

  return violations;
}

function run() {
  console.log('========================================');
  console.log('  SEMBLANCE PRIVACY AUDIT');
  console.log('  Scanning packages/core/ for network violations');
  console.log('========================================\n');

  const allViolations = [];

  // Scan TypeScript and JavaScript files
  const jsFiles = collectFiles(CORE_DIR, ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
  console.log(`Scanning ${jsFiles.length} TypeScript/JavaScript file(s)...`);
  for (const file of jsFiles) {
    const violations = scanFile(file, BANNED_JS_PATTERNS, PATTERN_NAMES_JS);
    allViolations.push(...violations);
  }

  // Scan Rust files
  const rsFiles = collectFiles(CORE_DIR, ['.rs']);
  console.log(`Scanning ${rsFiles.length} Rust file(s)...`);
  for (const file of rsFiles) {
    const violations = scanFile(file, BANNED_RUST_PATTERNS, PATTERN_NAMES_RUST);
    allViolations.push(...violations);
  }

  console.log('');

  if (allViolations.length === 0) {
    console.log('RESULT: CLEAN');
    console.log('No network capability violations found in packages/core/.');
    console.log(`Total files scanned: ${jsFiles.length + rsFiles.length}`);
    process.exit(0);
  } else {
    console.log(`RESULT: ${allViolations.length} VIOLATION(S) FOUND`);
    console.log('');
    for (const v of allViolations) {
      const relPath = relative(join(CORE_DIR, '..', '..'), v.file);
      console.log(`  CRITICAL: ${v.violation}`);
      console.log(`    File: ${relPath}:${v.line}`);
      console.log(`    Code: ${v.content}`);
      console.log('');
    }
    console.log('The AI Core must NEVER have network capability.');
    console.log('All external communication must flow through the Gateway via IPC.');
    process.exit(1);
  }
}

run();
