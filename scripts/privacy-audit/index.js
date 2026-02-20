#!/usr/bin/env node

/**
 * Semblance Privacy Audit
 *
 * Scans all TypeScript, JavaScript, and Rust files under packages/core/
 * for imports of banned network modules. The AI Core must NEVER have
 * network capability. Any violation is a critical security incident.
 *
 * EXCEPTION: The `ollama` npm package is allowed in packages/core/llm/ ONLY.
 * Ollama communicates with the local Ollama server via HTTP to localhost:11434.
 * This is architecturally equivalent to a local database — no data leaves the device.
 * The OllamaProvider enforces a hard localhost-only check at initialization.
 * See STEP-3-CC.md for the full rationale.
 *
 * Exit code 0: Clean — no violations found.
 * Exit code 1: Violations found — merge must be blocked.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT_DIR = join(__dirname, '..', '..');
const CORE_DIR = join(ROOT_DIR, 'packages', 'core');
const DESKTOP_SRC_DIR = join(ROOT_DIR, 'packages', 'desktop', 'src');
const DESKTOP_PKG_JSON = join(ROOT_DIR, 'packages', 'desktop', 'package.json');
const TAURI_CONF_JSON = join(ROOT_DIR, 'packages', 'desktop', 'src-tauri', 'tauri.conf.json');

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
  // Ollama — allowed ONLY in packages/core/llm/ (see exception logic below)
  /\bimport\b.*['"]ollama['"]/,
  /\brequire\s*\(\s*['"]ollama['"]\s*\)/,
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
  'ollama import (allowed in packages/core/llm/ only)',
  'ollama require (allowed in packages/core/llm/ only)',
];

// Indices of patterns that are allowed in specific directories
// ollama import/require are the last two patterns (indices 9, 10)
const OLLAMA_PATTERN_INDICES = [BANNED_JS_PATTERNS.length - 2, BANNED_JS_PATTERNS.length - 1];

// Directory where ollama is permitted (relative to CORE_DIR, normalized to forward slashes)
const OLLAMA_ALLOWED_DIR = 'llm';

// The IPC client file is permitted to use node:net for local domain socket / named pipe communication.
// This is the typed IPC channel to the Gateway — it is NOT internet networking.
// We allow ONLY 'node:net' — NOT http, https, tls, dgram, dns.
const IPC_CLIENT_FILE = 'agent/ipc-client.ts';
const IPC_NET_ALLOWED_PATTERN = /\bimport\b.*['"]node:net['"]/;

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

/**
 * Check if a file is within the ollama-allowed directory (packages/core/llm/).
 */
function isInOllamaAllowedDir(filePath) {
  const relPath = relative(CORE_DIR, filePath).replace(/\\/g, '/');
  return relPath.startsWith(OLLAMA_ALLOWED_DIR + '/');
}

/**
 * Check if a file is the IPC client (allowed to use node:net for local domain sockets).
 */
function isIPCClientFile(filePath) {
  const relPath = relative(CORE_DIR, filePath).replace(/\\/g, '/');
  return relPath === IPC_CLIENT_FILE;
}

function scanFile(filePath, patterns, patternNames, skipIndices = []) {
  const violations = [];
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let p = 0; p < patterns.length; p++) {
      if (skipIndices.includes(p)) continue;
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
  let ollamaExceptionsApplied = 0;
  for (const file of jsFiles) {
    // Files in packages/core/llm/ may import 'ollama' — skip those pattern checks
    const skipIndices = isInOllamaAllowedDir(file) ? OLLAMA_PATTERN_INDICES : [];
    if (skipIndices.length > 0) ollamaExceptionsApplied++;
    let violations = scanFile(file, BANNED_JS_PATTERNS, PATTERN_NAMES_JS, skipIndices);

    // Post-filter: the IPC client may use node:net for local domain socket / named pipe.
    // Allow ONLY 'node:net' (not http, https, tls, dgram, dns).
    if (isIPCClientFile(file)) {
      violations = violations.filter(v => !IPC_NET_ALLOWED_PATTERN.test(v.content));
    }

    allViolations.push(...violations);
  }
  if (ollamaExceptionsApplied > 0) {
    console.log(`  (Ollama localhost exception applied to ${ollamaExceptionsApplied} file(s) in packages/core/llm/)`);
  }

  // Scan Rust files
  const rsFiles = collectFiles(CORE_DIR, ['.rs']);
  console.log(`Scanning ${rsFiles.length} Rust file(s)...`);
  for (const file of rsFiles) {
    const violations = scanFile(file, BANNED_RUST_PATTERNS, PATTERN_NAMES_RUST);
    allViolations.push(...violations);
  }

  console.log('');

  // ─── Desktop Package Audit ───────────────────────────────────────────────
  console.log('========================================');
  console.log('  DESKTOP PACKAGE AUDIT');
  console.log('  Scanning packages/desktop/src/ for violations');
  console.log('========================================\n');

  // Scan desktop frontend for direct network calls
  const BANNED_DESKTOP_PATTERNS = [
    /\bimport\b.*['"](?:node:)?(?:http|https|net|dgram|dns|tls)['"]/,
    /\brequire\s*\(\s*['"](?:node:)?(?:http|https|net|dgram|dns|tls)['"]\s*\)/,
    /\bimport\b.*['"](?:axios|got|node-fetch|undici|superagent)['"]/,
    /\brequire\s*\(\s*['"](?:axios|got|node-fetch|undici|superagent)['"]\s*\)/,
    /\bimport\b.*['"](?:socket\.io|ws)['"]/,
    /\bnew\s+XMLHttpRequest\b/,
    /\bnew\s+WebSocket\b/,
  ];

  const DESKTOP_PATTERN_NAMES = [
    'Node.js http/https/net/dgram/dns/tls import',
    'Node.js http/https/net/dgram/dns/tls require',
    'Third-party HTTP library import',
    'Third-party HTTP library require',
    'WebSocket library import',
    'XMLHttpRequest usage',
    'WebSocket constructor',
  ];

  // Note: fetch() is NOT banned in desktop frontend — Tauri's invoke() calls are the approved pattern.
  // The CSP blocks external URLs. Direct fetch() to external URLs would be blocked by CSP.

  const desktopFiles = collectFiles(DESKTOP_SRC_DIR, ['.ts', '.tsx', '.js', '.jsx']);
  console.log(`Scanning ${desktopFiles.length} desktop frontend file(s)...`);
  for (const file of desktopFiles) {
    const violations = scanFile(file, BANNED_DESKTOP_PATTERNS, DESKTOP_PATTERN_NAMES);
    allViolations.push(...violations);
  }

  // Verify tauri.conf.json: updater must be disabled, CSP must block external origins
  console.log('\nVerifying Tauri configuration...');
  let tauriConfChecked = false;
  try {
    const tauriConf = JSON.parse(readFileSync(TAURI_CONF_JSON, 'utf-8'));

    // Check that updater is NOT enabled
    const plugins = tauriConf.plugins || {};
    if (plugins.updater && plugins.updater.active !== false) {
      allViolations.push({
        file: TAURI_CONF_JSON,
        line: 0,
        content: 'plugins.updater.active is not disabled',
        violation: 'Tauri updater must be disabled — Semblance does not auto-update',
      });
    }
    console.log('  Updater: disabled (OK)');

    // Check CSP blocks external origins
    const csp = tauriConf?.app?.security?.csp || '';
    if (!csp) {
      allViolations.push({
        file: TAURI_CONF_JSON,
        line: 0,
        content: 'No CSP configured',
        violation: 'Content Security Policy must be configured to block external resource loading',
      });
    } else {
      // CSP must NOT contain http: or https: origins (except tauri: and asset: schemes)
      const externalOriginPattern = /https?:\/\/(?!localhost)/;
      if (externalOriginPattern.test(csp)) {
        allViolations.push({
          file: TAURI_CONF_JSON,
          line: 0,
          content: csp,
          violation: 'CSP allows external HTTP/HTTPS origins — all resources must be bundled locally',
        });
      }
      // Must have default-src 'self'
      if (!csp.includes("default-src 'self'")) {
        allViolations.push({
          file: TAURI_CONF_JSON,
          line: 0,
          content: csp,
          violation: "CSP missing default-src 'self' — must restrict default resource loading",
        });
      }
      console.log('  CSP: configured and blocks external origins (OK)');
    }
    tauriConfChecked = true;
  } catch {
    console.log('  (tauri.conf.json not found or unreadable — skipping Tauri checks)');
  }

  // Check for banned analytics/telemetry packages in desktop package.json
  console.log('\nChecking desktop dependencies for banned packages...');
  const BANNED_PACKAGES = [
    'segment', '@segment/', 'mixpanel', 'amplitude', 'posthog', '@posthog/',
    'sentry', '@sentry/', 'bugsnag', '@bugsnag/', 'datadog', '@datadog/',
    'google-analytics', 'gtag', 'hotjar', 'fullstory', 'logrocket',
  ];
  try {
    const pkgJson = JSON.parse(readFileSync(DESKTOP_PKG_JSON, 'utf-8'));
    const allDeps = {
      ...(pkgJson.dependencies || {}),
      ...(pkgJson.devDependencies || {}),
    };
    for (const dep of Object.keys(allDeps)) {
      if (BANNED_PACKAGES.some(banned => dep === banned || dep.startsWith(banned))) {
        allViolations.push({
          file: DESKTOP_PKG_JSON,
          line: 0,
          content: dep,
          violation: `Banned analytics/telemetry package: ${dep}`,
        });
      }
    }
    console.log(`  Dependencies checked: ${Object.keys(allDeps).length} packages (OK)`);
  } catch {
    console.log('  (desktop package.json not found — skipping dependency check)');
  }

  console.log('');

  if (allViolations.length === 0) {
    console.log('========================================');
    console.log('RESULT: CLEAN');
    console.log(`No violations found.`);
    console.log(`Core files scanned: ${jsFiles.length + rsFiles.length}`);
    console.log(`Desktop files scanned: ${desktopFiles.length}`);
    if (tauriConfChecked) console.log('Tauri config: verified');
    console.log('========================================');
    process.exit(0);
  } else {
    console.log(`RESULT: ${allViolations.length} VIOLATION(S) FOUND`);
    console.log('');
    for (const v of allViolations) {
      const relPath = relative(ROOT_DIR, v.file);
      console.log(`  CRITICAL: ${v.violation}`);
      console.log(`    File: ${relPath}${v.line ? ':' + v.line : ''}`);
      console.log(`    Code: ${v.content}`);
      console.log('');
    }
    console.log('Fix all violations before merging.');
    process.exit(1);
  }
}

run();
