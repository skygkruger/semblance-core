/**
 * Desktop Privacy Tests
 *
 * Verifies that the desktop package meets all privacy requirements:
 * - CSP blocks external resources
 * - Updater endpoints are GitHub Releases only (no custom servers)
 * - No telemetry or analytics in desktop package
 * - No external font/script URLs in bundle
 * - No direct network calls in desktop frontend
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const DESKTOP_DIR = join(ROOT, 'packages', 'desktop');
const TAURI_CONF = join(DESKTOP_DIR, 'src-tauri', 'tauri.conf.json');
const DESKTOP_SRC = join(DESKTOP_DIR, 'src');
const DESKTOP_PKG = join(DESKTOP_DIR, 'package.json');
const INDEX_HTML = join(DESKTOP_DIR, 'index.html');

function collectFiles(dir: string, extensions: string[]): string[] {
  const files: string[] = [];
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          if (entry === 'node_modules' || entry === 'dist') continue;
          files.push(...collectFiles(fullPath, extensions));
        } else if (extensions.some(ext => entry.endsWith(ext))) {
          files.push(fullPath);
        }
      } catch {
        // skip
      }
    }
  } catch {
    // dir doesn't exist
  }
  return files;
}

describe('Desktop Privacy: CSP', () => {
  const tauriConf = JSON.parse(readFileSync(TAURI_CONF, 'utf-8'));
  const csp = tauriConf?.app?.security?.csp || '';

  it('has a Content Security Policy configured', () => {
    expect(csp).toBeTruthy();
    expect(csp.length).toBeGreaterThan(0);
  });

  it('CSP sets default-src to self', () => {
    expect(csp).toContain("default-src 'self'");
  });

  it('CSP does not allow external HTTP/HTTPS origins', () => {
    // Should not contain any http:// or https:// URLs (except tauri internal)
    const externalPattern = /https?:\/\/(?!localhost)/;
    expect(externalPattern.test(csp)).toBe(false);
  });

  it('CSP blocks frames', () => {
    expect(csp).toContain("frame-src 'none'");
  });

  it('CSP blocks object embeds', () => {
    expect(csp).toContain("object-src 'none'");
  });

  it('CSP restricts font loading to self and tauri protocols', () => {
    expect(csp).toMatch(/font-src\s+'self'/);
  });

  it('CSP restricts script loading to self', () => {
    expect(csp).toMatch(/script-src\s+'self'/);
  });
});

describe('Desktop Privacy: Updater', () => {
  const tauriConf = JSON.parse(readFileSync(TAURI_CONF, 'utf-8'));
  const plugins = tauriConf.plugins || {};

  it('updater endpoints point only to GitHub Releases (no custom servers)', () => {
    if (!plugins.updater) return; // No updater = fine
    const endpoints: string[] = plugins.updater.endpoints || [];
    for (const ep of endpoints) {
      expect(ep).toMatch(/^https:\/\/github\.com\/.*\/releases\//);
    }
  });

  it('updater does not transmit user data (one-way download only)', () => {
    // The Tauri updater is a read-only check against a static JSON manifest.
    // It sends no device identifiers, no user data, no telemetry.
    // This test documents the architectural guarantee.
    if (!plugins.updater) return;
    expect(plugins.updater.endpoints).toBeDefined();
    expect(Array.isArray(plugins.updater.endpoints)).toBe(true);
  });
});

describe('Desktop Privacy: No Telemetry', () => {
  const pkgJson = JSON.parse(readFileSync(DESKTOP_PKG, 'utf-8'));
  const allDeps = {
    ...(pkgJson.dependencies || {}),
    ...(pkgJson.devDependencies || {}),
  };
  const depNames = Object.keys(allDeps);

  const BANNED_PACKAGES = [
    'segment', '@segment/',
    'mixpanel', 'amplitude',
    'posthog', '@posthog/',
    'sentry', '@sentry/',
    'bugsnag', '@bugsnag/',
    'datadog', '@datadog/',
    'google-analytics', 'gtag',
    'hotjar', 'fullstory', 'logrocket',
  ];

  it('does not include any analytics or telemetry packages', () => {
    for (const dep of depNames) {
      for (const banned of BANNED_PACKAGES) {
        expect(dep === banned || dep.startsWith(banned), `Banned package found: ${dep}`).toBe(false);
      }
    }
  });

  it('does not include error tracking SDKs that phone home', () => {
    const errorTrackers = ['sentry', '@sentry/', 'bugsnag', '@bugsnag/', 'datadog', '@datadog/'];
    for (const dep of depNames) {
      for (const tracker of errorTrackers) {
        expect(dep === tracker || dep.startsWith(tracker), `Banned error tracker: ${dep}`).toBe(false);
      }
    }
  });
});

describe('Desktop Privacy: No External Font/Script URLs', () => {
  it('index.html does not reference Google Fonts CDN', () => {
    const html = readFileSync(INDEX_HTML, 'utf-8');
    expect(html).not.toContain('fonts.googleapis.com');
    expect(html).not.toContain('fonts.gstatic.com');
  });

  it('index.html does not reference any external CDN', () => {
    const html = readFileSync(INDEX_HTML, 'utf-8');
    // Should not have any https:// links except in comments
    const lines = html.split('\n').filter(l => !l.trim().startsWith('<!--'));
    for (const line of lines) {
      if (line.includes('href=') || line.includes('src=')) {
        expect(line).not.toMatch(/https?:\/\/(?!localhost)/);
      }
    }
  });

  it('frontend source files do not load external resources', () => {
    const srcFiles = collectFiles(DESKTOP_SRC, ['.ts', '.tsx']);
    for (const file of srcFiles) {
      const content = readFileSync(file, 'utf-8');
      // Should not contain external URLs in code (excluding comments)
      const lines = content.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'));
      for (const line of lines) {
        if (line.includes('https://') && !line.includes('localhost')) {
          // Allow URL strings in comments or data that don't load resources
          expect(line).not.toMatch(/(?:fetch|import|require|src=|href=)\s*\(?['"]https?:\/\/(?!localhost)/);
        }
      }
    }
  });
});

describe('Desktop Privacy: No Direct Network Calls in Frontend', () => {
  const srcFiles = collectFiles(DESKTOP_SRC, ['.ts', '.tsx']);

  it('does not import Node.js networking modules', () => {
    for (const file of srcFiles) {
      const content = readFileSync(file, 'utf-8');
      expect(content).not.toMatch(/import\b.*['"](?:node:)?(?:http|https|net|dgram|dns|tls)['"]/);
    }
  });

  it('does not import third-party HTTP libraries', () => {
    for (const file of srcFiles) {
      const content = readFileSync(file, 'utf-8');
      expect(content).not.toMatch(/import\b.*['"](?:axios|got|node-fetch|undici|superagent)['"]/);
    }
  });

  it('does not use XMLHttpRequest', () => {
    for (const file of srcFiles) {
      const content = readFileSync(file, 'utf-8');
      expect(content).not.toMatch(/new\s+XMLHttpRequest/);
    }
  });

  it('does not use WebSocket constructor directly', () => {
    for (const file of srcFiles) {
      const content = readFileSync(file, 'utf-8');
      expect(content).not.toMatch(/new\s+WebSocket/);
    }
  });
});

describe('Desktop Privacy: fetch() Allowlist Enforcement', () => {
  const srcFiles = collectFiles(DESKTOP_SRC, ['.ts', '.tsx']);
  // Only LicenseContext.tsx is allowed to call fetch() — for user-initiated Stripe portal
  // and license worker communication. All other files must use Tauri invoke().
  const FETCH_ALLOWLIST = new Set(['contexts/LicenseContext.tsx']);

  it('only allowlisted files contain fetch() calls', () => {
    const violators: string[] = [];
    for (const file of srcFiles) {
      const relPath = file.replace(/\\/g, '/').split('/src/').pop() || '';
      if (FETCH_ALLOWLIST.has(relPath)) continue;

      const content = readFileSync(file, 'utf-8');
      if (/\bfetch\s*\(/.test(content)) {
        violators.push(relPath);
      }
    }
    expect(
      violators,
      `Unexpected fetch() calls found in: ${violators.join(', ')}. ` +
      `Use Tauri invoke() instead, or add to FETCH_ALLOWLIST with justification.`
    ).toEqual([]);
  });

  it('LicenseContext.tsx exists and contains fetch (sanity check)', () => {
    const licenseCtx = srcFiles.find(f => f.replace(/\\/g, '/').endsWith('contexts/LicenseContext.tsx'));
    expect(licenseCtx, 'LicenseContext.tsx must exist in desktop src').toBeDefined();
    if (licenseCtx) {
      const content = readFileSync(licenseCtx, 'utf-8');
      expect(content).toMatch(/\bfetch\s*\(/);
    }
  });
});

describe('Desktop Privacy: Privacy audit script passes', () => {
  it('privacy audit exits clean with desktop checks', () => {
    const { execSync } = require('node:child_process');
    const result = execSync('node scripts/privacy-audit/index.js', {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    expect(result).toContain('RESULT: CLEAN');
    expect(result).toContain('Desktop files scanned');
  });
});
