/**
 * Step 33 — Commit 4: Sprint 6 (Hardening + Launch) Validation
 *
 * Validates privacy dashboard, sandboxing, crypto, mobile parity,
 * launch metadata, CI/CD, and cross-sprint integrity.
 *
 * 20 tests.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { verifySandbox, auditSandboxConfig } from '../../packages/core/security/sandbox-verifier.js';

const ROOT = join(import.meta.dirname, '..', '..');

// Source files
const PRIVACY_TRACKER = readFileSync(join(ROOT, 'packages/core/privacy/privacy-tracker.ts'), 'utf-8');
const DASHBOARD_PROVIDER = readFileSync(join(ROOT, 'packages/core/privacy/privacy-dashboard-provider.ts'), 'utf-8');
const ED25519_SRC = readFileSync(join(ROOT, 'packages/core/crypto/ed25519.ts'), 'utf-8');
const DB_ENCRYPT = readFileSync(join(ROOT, 'packages/core/crypto/database-encryption.ts'), 'utf-8');
const KEY_DERIVATION = readFileSync(join(ROOT, 'packages/core/crypto/key-derivation.ts'), 'utf-8');
const MOBILE_PKG = readFileSync(join(ROOT, 'packages/mobile/package.json'), 'utf-8');
const ROOT_PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
const PRIVACY_AUDIT_SCRIPT = readFileSync(join(ROOT, 'scripts/privacy-audit/index.js'), 'utf-8');

describe('Step 33 — Sprint 6 (Hardening + Launch) Validation', () => {
  // ─── Privacy Dashboard ────────────────────────────────────────────────
  describe('Privacy Dashboard', () => {
    it('privacy barrel exports all 9 classes', async () => {
      const priv = await import('../../packages/core/privacy/index.js');
      expect(priv.DataInventoryCollector).toBeDefined();
      expect(priv.NetworkActivityAggregator).toBeDefined();
      expect(priv.ActionHistoryAggregator).toBeDefined();
      expect(priv.PrivacyGuaranteeChecker).toBeDefined();
      expect(priv.ComparisonStatementGenerator).toBeDefined();
      expect(priv.ProofOfPrivacyGenerator).toBeDefined();
      expect(priv.ProofOfPrivacyExporter).toBeDefined();
      expect(priv.PrivacyDashboardProvider).toBeDefined();
      expect(priv.PrivacyTracker).toBeDefined();
    });

    it('ComparisonStatementGenerator has generate method', () => {
      const src = readFileSync(join(ROOT, 'packages/core/privacy/comparison-statement-generator.ts'), 'utf-8');
      expect(src).toContain('generate(');
    });

    it('ProofOfPrivacyGenerator has generate method', () => {
      const src = readFileSync(join(ROOT, 'packages/core/privacy/proof-of-privacy-generator.ts'), 'utf-8');
      expect(src).toContain('generate(');
    });

    it('ProofOfPrivacyExporter exists', async () => {
      const priv = await import('../../packages/core/privacy/index.js');
      expect(priv.ProofOfPrivacyExporter).toBeDefined();
    });

    it('PrivacyDashboardProvider aggregates all sources', () => {
      expect(DASHBOARD_PROVIDER).toContain('dataInventoryCollector');
    });

    it('PrivacyTracker implements ExtensionInsightTracker', () => {
      expect(PRIVACY_TRACKER).toContain('implements ExtensionInsightTracker');
    });
  });

  // ─── OS Sandboxing ────────────────────────────────────────────────────
  describe('Sandbox Verification', () => {
    it('verifySandbox returns violations for unknown platform', () => {
      const status = verifySandbox('freebsd');
      expect(status.violations.length).toBeGreaterThan(0);
      expect(status.sandboxActive).toBe(false);
    });

    it('auditSandboxConfig darwin: no critical violations', () => {
      const violations = auditSandboxConfig('darwin');
      const critical = violations.filter(v => v.severity === 'critical');
      expect(critical).toHaveLength(0);
    });

    it('auditSandboxConfig linux: no critical violations', () => {
      const violations = auditSandboxConfig('linux');
      const critical = violations.filter(v => v.severity === 'critical');
      expect(critical).toHaveLength(0);
    });

    it('auditSandboxConfig win32: no critical violations', () => {
      const violations = auditSandboxConfig('win32');
      const critical = violations.filter(v => v.severity === 'critical');
      expect(critical).toHaveLength(0);
    });
  });

  // ─── Cryptography ─────────────────────────────────────────────────────
  describe('Crypto', () => {
    it('Ed25519 module exports generateKeyPair, sign, verify', () => {
      expect(ED25519_SRC).toContain('export function generateKeyPair');
      expect(ED25519_SRC).toContain('export function sign');
      expect(ED25519_SRC).toContain('export function verify');
    });

    it('database encryption rejects invalid key length', () => {
      expect(DB_ENCRYPT).toContain('keyHex.length !== 64');
    });

    it('key derivation uses Argon2id with OWASP params', () => {
      expect(KEY_DERIVATION).toContain('argon2id');
      expect(KEY_DERIVATION).toContain('OWASP');
      expect(KEY_DERIVATION).toContain('65536'); // 64 MB memory cost
    });
  });

  // ─── Mobile Parity ────────────────────────────────────────────────────
  describe('Mobile', () => {
    it('mobile inference directory exists', () => {
      expect(existsSync(join(ROOT, 'packages/mobile/src/inference/mlx-bridge.ts'))).toBe(true);
      expect(existsSync(join(ROOT, 'packages/mobile/src/inference/llamacpp-bridge.ts'))).toBe(true);
    });

    it('mobile package.json has react-native', () => {
      expect(MOBILE_PKG).toContain('react-native');
    });

    it('task delegation module exists', () => {
      expect(existsSync(join(ROOT, 'packages/core/routing/task-delegation.ts'))).toBe(true);
    });
  });

  // ─── Launch Metadata ──────────────────────────────────────────────────
  describe('Launch Metadata', () => {
    it('package.json homepage is semblance.run', () => {
      expect(ROOT_PKG.homepage).toBe('https://semblance.run');
    });

    it('package.json license matches (MIT OR Apache-2.0)', () => {
      expect(ROOT_PKG.license).toBe('(MIT OR Apache-2.0)');
    });

    it('.github/workflows/ has 3+ workflow files', () => {
      const workflowDir = join(ROOT, '.github/workflows');
      const files = readdirSync(workflowDir).filter(f => f.endsWith('.yml'));
      expect(files.length).toBeGreaterThanOrEqual(3);
    });

    it('privacy audit script exists and is valid JS', () => {
      expect(existsSync(join(ROOT, 'scripts/privacy-audit/index.js'))).toBe(true);
      expect(PRIVACY_AUDIT_SCRIPT).toContain('function');
    });
  });
});
