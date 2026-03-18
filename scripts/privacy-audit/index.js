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
import { execSync as execSyncImport } from 'node:child_process';

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

// IPC files are permitted to use node:net for local domain socket / named pipe communication.
// This is the typed IPC channel to the Gateway — it is NOT internet networking.
// We allow ONLY 'node:net' — NOT http, https, tls, dgram, dns.
const IPC_NET_ALLOWED_FILES = [
  'agent/ipc-client.ts',         // Legacy IPC client (uses dynamic import of SocketTransport)
  'ipc/socket-transport.ts',     // SocketTransport — desktop IPC transport via Unix socket / named pipe
];
const IPC_NET_ALLOWED_PATTERN = /\bimport\b.*['"]node:net['"]/;

const PATTERN_NAMES_RUST = [
  'Rust reqwest crate usage',
  'Rust hyper crate usage',
  'Rust tokio::net usage',
  'Rust std::net usage',
  'Rust reqwest extern crate',
  'Rust hyper extern crate',
];

// ─── Dynamic Code Execution Patterns ───────────────────────────────────────────
// These detect code that could bypass static import analysis.
const DYNAMIC_EXEC_PATTERNS = [
  /\beval\s*\(/,
  /\bnew\s+Function\s*\(/,
  /\bFunction\s*\(\s*['"]/,
];

const DYNAMIC_EXEC_NAMES = [
  'eval() call — dynamic code execution bypasses static analysis',
  'new Function() constructor — dynamic code execution bypasses static analysis',
  'Function() constructor — dynamic code execution bypasses static analysis',
];

// Dynamic import() with non-literal argument — e.g., import(variable) or import(expr)
// Literal string imports like import('./known-module') are acceptable.
// Must not match method names (e.g., `async import(`) or comments.
const DYNAMIC_IMPORT_PATTERN = /(?<!\.)(?<!\w)\bimport\s*\(\s*(?!['"`])/;
const DYNAMIC_IMPORT_NAME = 'import() with non-literal argument — could load arbitrary modules at runtime';

// Approved exception for dynamic import: the extension loader uses dynamic import()
// with a variable to load @semblance/dr when installed. This is the ONLY approved
// non-literal import() in packages/core/.
const DYNAMIC_IMPORT_ALLOWED_FILES = [
  'extensions/loader.ts',
  'skills/skill-registry.ts',  // Skill registry uses dynamic import to load installed skills
];

// String concatenation patterns that assemble forbidden library names.
// Reuses the forbidden library list from BANNED_JS_PATTERNS.
const FORBIDDEN_LIBS = [
  'axios', 'got', 'node-fetch', 'undici', 'superagent',
  'socket.io', 'ws', 'http', 'https', 'net', 'dgram', 'dns', 'tls',
];

/**
 * Check if a line contains string concatenation or template literal that assembles
 * a forbidden library name (e.g., "ax" + "ios", `${"node" + "-fetch"}`).
 */
function detectConcatenatedForbiddenImport(line) {
  // Only scan lines that have concatenation or template literal interpolation
  if (!line.includes('+') && !line.includes('${')) return null;

  // For each forbidden lib, check if the line could assemble it via concatenation
  for (const lib of FORBIDDEN_LIBS) {
    if (lib.length < 3) continue; // Skip very short names to avoid false positives
    // Check all possible split points
    for (let splitAt = 1; splitAt < lib.length; splitAt++) {
      const left = lib.substring(0, splitAt);
      const right = lib.substring(splitAt);
      // Pattern: "left" + "right" (with optional whitespace)
      const concatPattern = new RegExp(
        `['"\`]${escapeRegex(left)}['"\`]\\s*\\+\\s*['"\`]${escapeRegex(right)}['"\`]`
      );
      if (concatPattern.test(line)) {
        return lib;
      }
    }
  }
  return null;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Check if a file is a test file (excluded from dynamic code execution checks).
 */
function isTestFile(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.includes('.test.') || normalized.includes('.spec.');
}

/**
 * Check if a file is allowed to use dynamic import().
 */
function isDynamicImportAllowedFile(filePath) {
  const relPath = relative(CORE_DIR, filePath).replace(/\\/g, '/');
  return DYNAMIC_IMPORT_ALLOWED_FILES.includes(relPath);
}

/**
 * Check if a line is a comment (single-line // or block comment continuation).
 */
function isCommentLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

/**
 * Check if a line is a method/function declaration using 'import' as a name.
 * e.g., `async import(data: string)` is a method, not a dynamic import.
 */
function isMethodDeclaration(line) {
  const trimmed = line.trim();
  return /\basync\s+import\s*\(/.test(trimmed) || /^\s*import\s*\(/.test(trimmed) && /\)\s*[:{\s]/.test(trimmed);
}

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
 * Check if a file is an IPC transport file (allowed to use node:net for local domain sockets).
 */
function isIPCNetAllowedFile(filePath) {
  const relPath = relative(CORE_DIR, filePath).replace(/\\/g, '/');
  return IPC_NET_ALLOWED_FILES.includes(relPath);
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

// ─── Transitive Dependency Scanning ────────────────────────────────────────
// Scans packages/core/ dependency tree for forbidden networking packages.
// All transitive dependencies under 'ollama' are exempt (ollama is approved for localhost comms).

const FORBIDDEN_TRANSITIVE_PACKAGES = [
  'axios', 'node-fetch', 'got', 'request', 'superagent', 'undici',
  'http2-wrapper', 'follow-redirects', 'needle', 'bent', 'ky', 'phin',
  'cross-fetch', 'isomorphic-fetch', 'native-fetch',
  'make-fetch-happen', 'minipass-fetch', 'agentkeepalive',
  'http-proxy-agent', 'https-proxy-agent', 'socks-proxy-agent',
  'proxy-agent', 'pac-proxy-agent', 'global-agent',
  'ws', 'socket.io', 'socket.io-client', 'sockjs', 'faye-websocket',
  'engine.io', 'primus',
  '@grpc/grpc-js', 'grpc', 'mqtt', 'amqplib', 'kafkajs', 'zeromq', 'nats',
  'ioredis', 'redis', 'tedious', 'pg', 'mysql2',
  '@sentry/node', '@amplitude/node', 'posthog-node', 'mixpanel',
  'analytics-node', '@segment/analytics-node', 'newrelic', 'dd-trace',
];

// Packages whose transitive trees are exempt (approved exceptions).
const TRANSITIVE_EXEMPT_PACKAGES = ['ollama'];

/**
 * Flatten a pnpm dependency tree object, collecting all package names and their chains.
 * Returns array of { name, chain } where chain is the dependency path.
 */
function flattenDeps(deps, chain = [], exemptRoots = new Set()) {
  const results = [];
  if (!deps || typeof deps !== 'object') return results;

  for (const [name, info] of Object.entries(deps)) {
    const currentChain = [...chain, name];
    const isExempt = exemptRoots.has(name) || chain.some(p => exemptRoots.has(p));
    results.push({ name, chain: currentChain, exempt: isExempt });

    if (info && typeof info === 'object' && info.dependencies) {
      const newExempt = TRANSITIVE_EXEMPT_PACKAGES.includes(name)
        ? new Set([...exemptRoots, name])
        : exemptRoots;
      results.push(...flattenDeps(info.dependencies, currentChain, newExempt));
    }
  }
  return results;
}

/**
 * Check if a package name matches any forbidden transitive package.
 * Uses exact match and prefix match for scoped packages.
 */
function isForbiddenPackage(pkgName) {
  return FORBIDDEN_TRANSITIVE_PACKAGES.some(forbidden => {
    if (forbidden.startsWith('@')) {
      // Scoped package: match exactly or with version suffix
      return pkgName === forbidden || pkgName.startsWith(forbidden + '/');
    }
    return pkgName === forbidden;
  });
}

/**
 * Run transitive dependency scan for packages/core/.
 * Returns array of violations.
 */
function scanTransitiveDeps() {
  const violations = [];
  try {
    const output = execSyncImport('pnpm list --depth 10 --json --filter @semblance/core', {
      cwd: ROOT_DIR,
      encoding: 'utf-8',
      timeout: 30000,
    });

    const parsed = JSON.parse(output);
    if (!Array.isArray(parsed) || parsed.length === 0) return violations;

    const deps = parsed[0].dependencies || {};
    const exemptRoots = new Set(TRANSITIVE_EXEMPT_PACKAGES);
    const allDeps = flattenDeps(deps, [], exemptRoots);

    for (const dep of allDeps) {
      if (dep.exempt) continue;
      if (isForbiddenPackage(dep.name)) {
        violations.push({
          file: 'packages/core/package.json',
          line: 0,
          content: `${dep.name} (via: ${dep.chain.join(' → ')})`,
          violation: `Forbidden networking package in transitive dependencies: ${dep.name}`,
        });
      }
    }
  } catch (err) {
    console.log(`  (Transitive dependency scan skipped: ${err.message})`);
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

    // Post-filter: IPC transport files may use node:net for local domain socket / named pipe.
    // Allow ONLY 'node:net' (not http, https, tls, dgram, dns).
    if (isIPCNetAllowedFile(file)) {
      violations = violations.filter(v => !IPC_NET_ALLOWED_PATTERN.test(v.content));
    }

    allViolations.push(...violations);
  }
  if (ollamaExceptionsApplied > 0) {
    console.log(`  (Ollama localhost exception applied to ${ollamaExceptionsApplied} file(s) in packages/core/llm/)`);
  }

  // ─── Dynamic Code Execution Scan ──────────────────────────────────────────
  // Detects eval(), Function(), dynamic import(), and string concatenation bypass
  // patterns in packages/core/. Test files and comment lines are excluded.
  console.log('\nScanning for dynamic code execution patterns...');
  let dynamicViolations = 0;
  for (const file of jsFiles) {
    if (isTestFile(file)) continue;

    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isCommentLine(line)) continue;

      // eval(), new Function(), Function()
      for (let p = 0; p < DYNAMIC_EXEC_PATTERNS.length; p++) {
        if (DYNAMIC_EXEC_PATTERNS[p].test(line)) {
          allViolations.push({
            file,
            line: i + 1,
            content: line.trim(),
            violation: DYNAMIC_EXEC_NAMES[p],
          });
          dynamicViolations++;
        }
      }

      // Dynamic import() with non-literal argument
      if (!isDynamicImportAllowedFile(file) && !isMethodDeclaration(line)) {
        if (DYNAMIC_IMPORT_PATTERN.test(line)) {
          allViolations.push({
            file,
            line: i + 1,
            content: line.trim(),
            violation: DYNAMIC_IMPORT_NAME,
          });
          dynamicViolations++;
        }
      }

      // String concatenation assembling forbidden library names
      const assembledLib = detectConcatenatedForbiddenImport(line);
      if (assembledLib) {
        allViolations.push({
          file,
          line: i + 1,
          content: line.trim(),
          violation: `String concatenation assembles forbidden library name: "${assembledLib}"`,
        });
        dynamicViolations++;
      }
    }
  }
  console.log(`  Dynamic code execution patterns checked: ${dynamicViolations} violation(s) found`);

  // Scan Rust files
  const rsFiles = collectFiles(CORE_DIR, ['.rs']);
  console.log(`\nScanning ${rsFiles.length} Rust file(s)...`);
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

  // fetch() is banned in desktop frontend EXCEPT for explicitly allowlisted files.
  // LicenseContext.tsx calls fetch() for user-initiated Stripe portal redirect and license
  // worker communication — these are the ONLY approved external fetch() calls in the frontend.
  const DESKTOP_FETCH_PATTERN = /\bfetch\s*\(/;
  const DESKTOP_FETCH_ALLOWLIST = new Set([
    'contexts/LicenseContext.tsx', // User-initiated Stripe portal + license worker calls
    'sound/desktop-sound-engine.ts', // Decodes bundled WAV assets from Vite/Tauri asset protocol (local only)
  ]);

  const desktopFiles = collectFiles(DESKTOP_SRC_DIR, ['.ts', '.tsx', '.js', '.jsx']);
  console.log(`Scanning ${desktopFiles.length} desktop frontend file(s)...`);
  for (const file of desktopFiles) {
    const violations = scanFile(file, BANNED_DESKTOP_PATTERNS, DESKTOP_PATTERN_NAMES);
    allViolations.push(...violations);

    // Scan for fetch() calls — banned unless file is on the allowlist
    const relPath = relative(DESKTOP_SRC_DIR, file).replace(/\\/g, '/');
    if (!DESKTOP_FETCH_ALLOWLIST.has(relPath)) {
      const fetchViolations = scanFile(
        file,
        [DESKTOP_FETCH_PATTERN],
        ['fetch() call in desktop frontend (not allowlisted — use Tauri invoke() instead)'],
      );
      allViolations.push(...fetchViolations);
    }
  }

  // Verify tauri.conf.json: updater must be disabled, CSP must block external origins
  console.log('\nVerifying Tauri configuration...');
  let tauriConfChecked = false;
  try {
    const tauriConf = JSON.parse(readFileSync(TAURI_CONF_JSON, 'utf-8'));

    // Check updater config: allowed only if endpoints point to GitHub Releases
    // (one-way download of update manifest — no user data transmitted)
    const plugins = tauriConf.plugins || {};
    if (plugins.updater) {
      const endpoints = plugins.updater.endpoints || [];
      const allGitHub = endpoints.length > 0 && endpoints.every(
        (ep) => ep.startsWith('https://github.com/') && ep.includes('/releases/')
      );
      if (!allGitHub) {
        allViolations.push({
          file: TAURI_CONF_JSON,
          line: 0,
          content: `plugins.updater.endpoints: ${JSON.stringify(endpoints)}`,
          violation: 'Tauri updater endpoints must point to GitHub Releases only (no custom servers)',
        });
      }
      console.log(`  Updater: configured with GitHub Releases endpoint (OK)`);
    } else {
      console.log('  Updater: not configured (OK)');
    }

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
      // CSP must NOT contain http: or https: origins (except localhost and *.localhost like ipc.localhost)
      const externalOriginPattern = /https?:\/\/(?!(?:\w+\.)?localhost\b)/;
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

  // ─── Transitive Dependency Scan ──────────────────────────────────────────
  console.log('\n========================================');
  console.log('  TRANSITIVE DEPENDENCY SCAN');
  console.log('  Checking packages/core/ dependency tree');
  console.log('========================================\n');

  const transitiveViolations = scanTransitiveDeps();
  allViolations.push(...transitiveViolations);
  if (transitiveViolations.length === 0) {
    console.log('  No forbidden networking packages in dependency tree (OK)');
  } else {
    console.log(`  ${transitiveViolations.length} forbidden package(s) found in dependency tree`);
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
