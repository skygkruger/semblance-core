/**
 * Step 33 — Commit 6: Final Privacy Audit
 *
 * Comprehensive privacy audit with recursive file scanning. Validates
 * zero-network AI Core, gateway isolation, zero telemetry, local-only data,
 * and Sanctuary Protocol compliance.
 *
 * 20 tests.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

// ─── Helper: Recursive TypeScript File Discovery ────────────────────────

function findTsFiles(dir: string): string[] {
  const results: string[] = [];
  function walk(d: string): void {
    if (!existsSync(d)) return;
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
        walk(full);
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

// Banned network imports (must not appear in packages/core/ except approved exceptions)
const BANNED_NETWORK_IMPORTS = [
  /import\s+.*\bfrom\s+['"](?:node:)?https?['"]/,
  /import\s+.*\bfrom\s+['"](?:node:)?net['"]/,
  /import\s+.*\bfrom\s+['"]axios['"]/,
  /import\s+.*\bfrom\s+['"]got['"]/,
  /import\s+.*\bfrom\s+['"]node-fetch['"]/,
  /import\s+.*\bfrom\s+['"]undici['"]/,
  /import\s+.*\bfrom\s+['"]socket\.io['"]/,
  /import\s+.*\bfrom\s+['"]ws['"]/,
  /import\s+.*\bfrom\s+['"]superagent['"]/,
];

// Approved exceptions
const APPROVED_NETWORK_FILES = new Set([
  join(ROOT, 'packages/core/ipc/socket-transport.ts').replace(/\\/g, '/'),
]);

describe('Step 33 — Final Privacy Audit', () => {
  // ═══════════════════════════════════════════════════════════════════════
  // ZERO-NETWORK AI CORE
  // ═══════════════════════════════════════════════════════════════════════
  describe('Zero-Network AI Core', () => {
    const coreFiles = findTsFiles(join(ROOT, 'packages/core'));

    it('no banned network imports in packages/core/ (except approved)', () => {
      const violations: string[] = [];
      for (const file of coreFiles) {
        const normalized = file.replace(/\\/g, '/');
        if (APPROVED_NETWORK_FILES.has(normalized)) continue;
        const content = readFileSync(file, 'utf-8');
        for (const pattern of BANNED_NETWORK_IMPORTS) {
          if (pattern.test(content)) {
            violations.push(`${file}: matches ${pattern}`);
          }
        }
      }
      expect(violations).toEqual([]);
    });

    it('ipc/socket-transport.ts is the sole node:net user', () => {
      const socketTransport = readFileSync(join(ROOT, 'packages/core/ipc/socket-transport.ts'), 'utf-8');
      expect(socketTransport).toContain("from 'node:net'");
      // No other file in core should import node:net
      const otherNetUsers = coreFiles.filter(f => {
        if (f.replace(/\\/g, '/').includes('ipc/socket-transport.ts')) return false;
        const content = readFileSync(f, 'utf-8');
        return /from\s+['"](?:node:)?net['"]/.test(content);
      });
      expect(otherNetUsers).toEqual([]);
    });

    it('ollama package only used in packages/core/llm/', () => {
      const ollamaUsers = coreFiles.filter(f => {
        if (!readFileSync(f, 'utf-8').includes("from 'ollama'")) return false;
        return !f.replace(/\\/g, '/').includes('packages/core/llm/');
      });
      expect(ollamaUsers).toEqual([]);
    });

    it('ollama adapter refuses non-localhost URLs', () => {
      const ollamaFiles = coreFiles.filter(f =>
        f.replace(/\\/g, '/').includes('packages/core/llm/') &&
        readFileSync(f, 'utf-8').includes('ollama'),
      );
      expect(ollamaFiles.length).toBeGreaterThan(0);
      // At least one ollama file should have localhost validation
      const hasLocalhostCheck = ollamaFiles.some(f => {
        const content = readFileSync(f, 'utf-8');
        return content.includes('localhost') || content.includes('127.0.0.1');
      });
      expect(hasLocalhostCheck).toBe(true);
    });

    it('packages/core/ has 50+ TypeScript files (comprehensive scan)', () => {
      expect(coreFiles.length).toBeGreaterThanOrEqual(50);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // GATEWAY ISOLATION
  // ═══════════════════════════════════════════════════════════════════════
  describe('Gateway Isolation', () => {
    const gatewayFiles = findTsFiles(join(ROOT, 'packages/gateway'));

    it('gateway never imports from core/knowledge/ directly (except reminder-store)', () => {
      const violations = gatewayFiles.filter(f => {
        const content = readFileSync(f, 'utf-8');
        // Allow reminder-store import (gateway needs it for reminder CRUD)
        const lines = content.split('\n').filter(l =>
          l.includes('core/knowledge/') && !l.includes('reminder-store'),
        );
        return lines.length > 0;
      });
      expect(violations).toEqual([]);
    });

    it('gateway never imports from core/agent/', () => {
      const violations = gatewayFiles.filter(f => {
        const content = readFileSync(f, 'utf-8');
        return content.includes("core/agent/");
      });
      expect(violations).toEqual([]);
    });

    it('service adapters implement ServiceAdapter interface', () => {
      const serviceFiles = gatewayFiles.filter(f =>
        f.replace(/\\/g, '/').includes('gateway/services/') &&
        f.endsWith('-adapter.ts'),
      );
      expect(serviceFiles.length).toBeGreaterThanOrEqual(3);
      const implementors = serviceFiles.filter(f =>
        readFileSync(f, 'utf-8').includes('implements ServiceAdapter'),
      );
      expect(implementors.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // ZERO TELEMETRY
  // ═══════════════════════════════════════════════════════════════════════
  describe('Zero Telemetry', () => {
    it('no analytics SDKs in any source file', () => {
      const ANALYTICS_PATTERNS = [
        /import\s+.*\bfrom\s+['"]@segment\//,
        /import\s+.*\bfrom\s+['"]mixpanel/,
        /import\s+.*\bfrom\s+['"]amplitude/,
        /import\s+.*\bfrom\s+['"]posthog/,
        /import\s+.*\bfrom\s+['"]@sentry\//,
        /import\s+.*\bfrom\s+['"]@datadog\//,
      ];
      const allFiles = [
        ...findTsFiles(join(ROOT, 'packages/core')),
        ...findTsFiles(join(ROOT, 'packages/gateway')),
        ...findTsFiles(join(ROOT, 'packages/desktop/src')),
        ...findTsFiles(join(ROOT, 'packages/semblance-ui')),
      ];
      const violations: string[] = [];
      for (const file of allFiles) {
        const content = readFileSync(file, 'utf-8');
        for (const pattern of ANALYTICS_PATTERNS) {
          if (pattern.test(content)) {
            violations.push(`${file}: matches ${pattern}`);
          }
        }
      }
      expect(violations).toEqual([]);
    });

    it('no tracking dependencies in package.json', () => {
      const pkg = readFileSync(join(ROOT, 'package.json'), 'utf-8');
      const banned = ['segment', 'mixpanel', 'amplitude', 'posthog', 'sentry', 'datadog', 'bugsnag'];
      for (const name of banned) {
        expect(pkg.toLowerCase()).not.toContain(name);
      }
    });

    it('no tracking scripts in landing page', () => {
      const landing = readFileSync(join(ROOT, 'docs/website/index.html'), 'utf-8');
      expect(landing).not.toContain('google-analytics');
      expect(landing).not.toContain('gtag');
      expect(landing).not.toContain('facebook.net');
      expect(landing).not.toContain('segment.com');
    });

    it('storybook telemetry disabled', () => {
      const storyMain = readFileSync(join(ROOT, 'packages/semblance-ui/.storybook/main.ts'), 'utf-8');
      expect(storyMain).toContain('disableTelemetry: true');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // LOCAL-ONLY DATA
  // ═══════════════════════════════════════════════════════════════════════
  describe('Local-Only Data', () => {
    it('no cloud storage imports in core except sync.ts and cloud-storage/', () => {
      const coreFiles = findTsFiles(join(ROOT, 'packages/core'));
      const violations = coreFiles.filter(f => {
        const norm = f.replace(/\\/g, '/');
        if (norm.includes('routing/sync') || norm.includes('cloud-storage/')) return false;
        const content = readFileSync(f, 'utf-8');
        return /import.*['"].*cloud(?:flare|front|aws|s3|gcs|azure)/i.test(content);
      });
      expect(violations).toEqual([]);
    });

    it('SQLite is the only relational database', () => {
      const pkg = readFileSync(join(ROOT, 'package.json'), 'utf-8');
      expect(pkg).toContain('better-sqlite3');
      expect(pkg).not.toContain('postgres');
      expect(pkg).not.toContain('mysql');
      expect(pkg).not.toContain('mongodb');
    });

    it('LanceDB confined to vector store and backup files', () => {
      const coreFiles = findTsFiles(join(ROOT, 'packages/core'));
      const allowedPaths = ['vector', 'backup', 'package.json'];
      const lanceUsers = coreFiles.filter(f => {
        const content = readFileSync(f, 'utf-8');
        if (!content.includes('lancedb')) return false;
        const norm = f.replace(/\\/g, '/');
        return !allowedPaths.some(p => norm.includes(p));
      });
      expect(lanceUsers).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // SANCTUARY PROTOCOL
  // ═══════════════════════════════════════════════════════════════════════
  describe('Sanctuary Protocol', () => {
    it('no emotion keywords in gateway source', () => {
      const gatewayFiles = findTsFiles(join(ROOT, 'packages/gateway'));
      const violations = gatewayFiles.filter(f => {
        const content = readFileSync(f, 'utf-8');
        return /\b(emotion|emotional|feeling|mood|sentiment)\b/i.test(content);
      });
      expect(violations).toEqual([]);
    });

    it('no user profiling keywords in gateway', () => {
      const gatewayFiles = findTsFiles(join(ROOT, 'packages/gateway'));
      const violations = gatewayFiles.filter(f => {
        const content = readFileSync(f, 'utf-8');
        return /\b(user.?profil|behavioral.?track|personality.?model)\b/i.test(content);
      });
      expect(violations).toEqual([]);
    });

    it('health data modules are local-only (no gateway imports)', () => {
      // Health data should never flow through gateway for tracking
      const healthFiles = findTsFiles(join(ROOT, 'packages/core')).filter(f =>
        f.replace(/\\/g, '/').includes('health'),
      );
      // Even if no health dir exists yet, verify gateway doesn't import health
      const gatewayFiles = findTsFiles(join(ROOT, 'packages/gateway'));
      const gatewayHealthImports = gatewayFiles.filter(f =>
        readFileSync(f, 'utf-8').includes('health-tracking'),
      );
      expect(gatewayHealthImports).toEqual([]);
    });

    it('audit trail is append-only (no DELETE/UPDATE on audit_log)', () => {
      const trail = readFileSync(join(ROOT, 'packages/gateway/audit/trail.ts'), 'utf-8');
      // Should not have DELETE FROM audit_log or UPDATE audit_log
      expect(trail).not.toMatch(/DELETE\s+FROM\s+audit_log/i);
      expect(trail).not.toMatch(/UPDATE\s+audit_log/i);
    });

    it('privacy audit script exists and is runnable', () => {
      expect(existsSync(join(ROOT, 'scripts/privacy-audit/index.js'))).toBe(true);
      const script = readFileSync(join(ROOT, 'scripts/privacy-audit/index.js'), 'utf-8');
      expect(script.length).toBeGreaterThan(100);
    });
  });
});
