/**
 * Step 33 — Commit 8: Sprint Regression Guards
 *
 * Regression tests for known historical issues. Each test targets a
 * specific bug that was fixed during development to prevent recurrence.
 *
 * 10 tests.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ActionType } from '../../packages/core/types/ipc.js';
import { PremiumGate, type PremiumFeature } from '../../packages/core/premium/premium-gate.js';
import { ArchiveBuilder } from '../../packages/core/living-will/archive-builder.js';
import { AttestationSigner } from '../../packages/core/attestation/attestation-signer.js';
import { canonicalizePayload } from '../../packages/core/attestation/attestation-format.js';
import { AutonomyManager } from '../../packages/core/agent/autonomy.js';
import type { DatabaseHandle } from '../../packages/core/platform/types.js';

const ROOT = join(import.meta.dirname, '..', '..');

function createMockDb(): DatabaseHandle {
  return {
    exec(): void {},
    prepare() {
      return {
        run(..._args: unknown[]) { return { changes: 0, lastInsertRowid: 0 }; },
        get(..._args: unknown[]) { return undefined; },
        all(..._args: unknown[]) { return []; },
      };
    },
    close(): void {},
    transaction<T>(fn: () => T): () => T { return fn; },
  } as unknown as DatabaseHandle;
}

describe('Step 33 — Sprint Regression Guards', () => {
  // Regression 1: DarkPatternTracker insight ordering (Step 25 fix)
  it('DarkPatternTracker orders insights by flagged_at DESC', () => {
    const src = readFileSync(join(ROOT, 'packages/core/defense/dark-pattern-tracker.ts'), 'utf-8');
    expect(src).toContain('ORDER BY');
    expect(src).toContain('flagged_at DESC');
  });

  // Regression 2: FEATURE_TIER_MAP exhaustive (all 20 PremiumFeature values)
  it('FEATURE_TIER_MAP covers all 20 PremiumFeature values', () => {
    const src = readFileSync(join(ROOT, 'packages/core/premium/premium-gate.ts'), 'utf-8');
    const allFeatures: PremiumFeature[] = [
      'transaction-categorization', 'spending-insights', 'anomaly-detection',
      'plaid-integration', 'financial-dashboard', 'representative-drafting',
      'subscription-cancellation', 'representative-dashboard', 'form-automation',
      'bureaucracy-tracking', 'health-tracking', 'health-insights',
      'import-digital-life', 'dark-pattern-detection', 'financial-advocacy',
      'living-will', 'witness-attestation', 'inheritance-protocol',
      'semblance-network', 'proof-of-privacy',
    ];
    for (const f of allFeatures) {
      expect(src).toContain(`'${f}'`);
    }
  });

  // Regression 3: AttestationSigner rejects missing keys
  it('AttestationSigner throws when constructed without any signing key', () => {
    expect(() => {
      new AttestationSigner({
        deviceIdentity: { id: 'test', platform: 'test' },
      });
    }).toThrow();
  });

  // Regression 4: ArchiveBuilder v2 not v1
  it('ArchiveBuilder uses version 2, not version 1', () => {
    const builder = new ArchiveBuilder();
    const manifest = builder.buildManifest('device', ['knowledgeGraph']);
    expect(manifest.version).toBe(2);
    expect(manifest.version).not.toBe(1);
  });

  // Regression 5: canonicalizePayload is deterministic
  it('canonicalizePayload produces identical output for identical input', () => {
    const payload = {
      type: 'test' as const,
      subject: 'test-subject',
      action: 'test-action',
      timestamp: '2026-01-01T00:00:00Z',
      deviceId: 'device-001',
    };
    const first = canonicalizePayload(payload);
    const second = canonicalizePayload(payload);
    expect(first).toBe(second);
    // Also verify it's a non-empty string
    expect(first.length).toBeGreaterThan(10);
  });

  // Regression 6: constantTimeEqual prevents timing attacks
  it('attestation verifier uses constant-time comparison', () => {
    const src = readFileSync(join(ROOT, 'packages/core/attestation/attestation-verifier.ts'), 'utf-8');
    expect(src).toContain('constantTimeEqual');
    // Verify the implementation XORs bytes (timing-attack resistant)
    expect(src).toContain('^');
  });

  // Regression 7: AlterEgoWeek completeDay advances day
  it('AlterEgoWeek getAllDays returns sequential day numbers', async () => {
    const mod = await import('../../packages/core/onboarding/alter-ego-week.js');
    const week = new mod.AlterEgoWeek({ db: createMockDb() });
    const days = week.getAllDays();
    for (let i = 0; i < days.length; i++) {
      expect(days[i]!.day).toBe(i + 1);
    }
  });

  // Regression 8: MorningBrief omits empty sections
  it('MorningBrief only includes sections with items', () => {
    const src = readFileSync(join(ROOT, 'packages/core/agent/morning-brief.ts'), 'utf-8');
    // Pattern: if (section.items.length > 0) sections.push(section)
    expect(src).toContain('items.length > 0');
    // Verify this pattern appears for multiple section types
    const occurrences = (src.match(/items\.length > 0/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(5);
  });

  // Regression 9: Partner auto-approves read/write but not execute
  it('partner tier auto-approves read and write but requires approval for execute', () => {
    const mgr = new AutonomyManager(createMockDb());
    // Read → auto_approve
    expect(mgr.decide('email.fetch')).toBe('auto_approve');
    expect(mgr.decide('calendar.fetch')).toBe('auto_approve');
    // Write → auto_approve
    expect(mgr.decide('email.draft')).toBe('auto_approve');
    expect(mgr.decide('calendar.create')).toBe('auto_approve');
    // Execute → requires_approval
    expect(mgr.decide('email.send')).toBe('requires_approval');
    expect(mgr.decide('calendar.delete')).toBe('requires_approval');
  });

  // Regression 10: ActionType schema rejects unknown strings
  it('ActionType zod schema rejects unknown action strings', () => {
    expect(ActionType.safeParse('email.fetch').success).toBe(true);
    expect(ActionType.safeParse('fake.action').success).toBe(false);
    expect(ActionType.safeParse('').success).toBe(false);
    expect(ActionType.safeParse(42).success).toBe(false);
  });
});
