import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cancelShare,
  createDiagnosticBundleService,
  generateBundle,
  getPendingShareRequest,
  prepareShareRequest,
  previewBundle,
  redactBundle,
  resetDiagnosticBundleServiceForTests,
} from '../../packages/core/diagnostics/index.js';

describe('Diagnostic privacy adversarial suite', () => {
  afterEach(() => {
    resetDiagnosticBundleServiceForTests();
  });

  it('redacts secrets, tokens, email bodies, and vault plaintext from generated bundles', () => {
    const bundle = generateBundle({
      logs: [{
        timestamp: '2026-07-19T12:00:00.000Z',
        level: 'error',
        message: 'OAuth failed for user@example.com with token=super-secret-token and sem_test.key.part',
        context: {
          apiKey: ['sk', 'test', '0'.repeat(24)].join('_'),
          emailBody: 'Please wire funds immediately',
          vaultPlaintext: 'Sensitive vault memo contents',
        },
      }],
    });

    const redacted = redactBundle(bundle);
    const serialized = JSON.stringify(redacted);

    expect(serialized).not.toContain('user@example.com');
    expect(serialized).not.toContain('super-secret-token');
    expect(serialized).not.toContain(['sk', 'test', '0'.repeat(24)].join('_'));
    expect(serialized).not.toContain('sem_test.key.part');
    expect(serialized).not.toContain('Please wire funds immediately');
    expect(serialized).not.toContain('Sensitive vault memo contents');
    expect(serialized).toContain('[REDACTED_EMAIL]');
    expect(serialized).toContain('[REDACTED_SECRET]');
    expect(serialized).toContain('[REDACTED_STRIPE_KEY]');
    expect(serialized).toContain('[REDACTED_VAULT_PLAINTEXT]');
    expect(redacted.redacted).toBe(true);
  });

  it('generates bundles offline with version and feature metadata', () => {
    const bundle = generateBundle({
      appVersion: '0.2.0-test',
      buildHash: 'abc123',
      featureFlags: { proofCenter: true },
    });
    const preview = previewBundle(bundle);

    expect(bundle.schemaVersion).toBe(1);
    expect(bundle.appVersion).toBe('0.2.0-test');
    expect(bundle.buildHash).toBe('abc123');
    expect(bundle.featureFlags.proofCenter).toBe(true);
    expect(preview.byteSize).toBeGreaterThan(0);
  });

  it('returns a Gateway share request from Core without performing upload', () => {
    const service = createDiagnosticBundleService();
    const bundle = service.generateBundle();
    const shareRequest = service.prepareShareRequest(bundle);

    expect(shareRequest.transport).toBe('gateway.support.upload');
    expect(shareRequest.requiresUserConsent).toBe(true);
    expect(shareRequest.message).toContain('Core never uploads');
    expect(service.getPendingShareRequest()?.bundleId).toBe(shareRequest.bundleId);
  });

  it('cancelShare clears pending share state', () => {
    const bundle = generateBundle();
    prepareShareRequest(bundle);
    expect(getPendingShareRequest()).not.toBeNull();

    const cancelled = cancelShare();
    expect(cancelled).toBe(true);
    expect(getPendingShareRequest()).toBeNull();
  });

  it('diagnostics module contains no fetch or http imports', () => {
    const modulePaths = [
      '../../packages/core/diagnostics/index.ts',
      '../../packages/core/diagnostics/bundle-service.ts',
      '../../packages/core/diagnostics/types.ts',
    ];

    for (const relativePath of modulePaths) {
      const source = readFileSync(resolve(__dirname, relativePath), 'utf8');
      expect(source).not.toMatch(/\bfetch\b/);
      expect(source).not.toMatch(/\bhttps?\b/);
      expect(source).not.toMatch(/from ['"]node:https['"]/);
      expect(source).not.toMatch(/from ['"]node:http['"]/);
    }
  });
});
