import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildProofCenterSnapshot,
  isProofCenterOfflineAcceptable,
  PROOF_CLASS_DEFINITIONS,
} from '../../../packages/core/proof-center/index.js';

const ROOT = join(import.meta.dirname, '../../../packages/core/proof-center');

const BANNED_PATTERNS = [
  /\bfrom\s+['"]node:fetch['"]/,
  /\bfrom\s+['"]node:http['"]/,
  /\bfrom\s+['"]node:https['"]/,
  /\bfrom\s+['"]node:net['"]/,
  /\bfrom\s+['"]undici['"]/,
  /\bfrom\s+['"]axios['"]/,
  /\bfetch\s*\(/,
];

function collectTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectTsFiles(fullPath));
    } else if (entry.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('proof-center network import ban', () => {
  it('has no fetch/http/https/net/undici imports in source', () => {
    const violations: string[] = [];
    for (const file of collectTsFiles(ROOT)) {
      const content = readFileSync(file, 'utf8');
      for (const pattern of BANNED_PATTERNS) {
        if (pattern.test(content)) {
          violations.push(`${file}: matched ${pattern}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe('buildProofCenterSnapshot — offline acceptance', () => {
  it('returns all proof classes with truthful empty defaults', () => {
    const snapshot = buildProofCenterSnapshot({
      auditTrail: null,
      actionLifecycleStore: null,
      connectedServices: [],
      executionPolicy: null,
      executionReceipts: [],
      extensionStatus: { configured: false, loaded: false, manifestId: null, manifestHash: null },
      activeModel: { modelId: null, provider: null, inferenceEngine: null },
      entitlement: { active: false, entitlementId: null, tier: null, revocationEpoch: null },
      vouchers: { remainingCount: 0, lastRedeemedAt: null },
      syncDevices: null,
      deletionState: { pendingTombstones: 0, completedDeletions: 0, retentionPolicyId: null, lastExportAt: null },
      measurementPolicy: { version: '20260719', allowedWorkloads: 1 },
      now: () => new Date('2026-07-19T12:00:00.000Z'),
    });

    expect(snapshot.classes).toHaveLength(PROOF_CLASS_DEFINITIONS.length);
    expect(snapshot.offlineInspectable).toBe(true);
    expect(isProofCenterOfflineAcceptable(snapshot)).toBe(true);
    expect(snapshot.isEmpty).toBe(true);
    expect(snapshot.degradedCount).toBeGreaterThan(0);
  });

  it('surfaces explicit degraded UI state for injected tampered/stale/pending/unavailable evidence', () => {
    const snapshot = buildProofCenterSnapshot({
      auditTrail: null,
      actionLifecycleStore: null,
      injectedOverrides: {
        'connector-access': {
          status: 'stale',
          summary: 'Injected stale connector evidence',
          degradedReason: 'Test stale connector',
        },
        'action-audit-integrity': {
          status: 'tampered',
          summary: 'Injected tampered audit chain',
          degradedReason: 'Test tampered chain',
        },
        'export-retention-deletion': {
          status: 'pending',
          summary: 'Injected pending deletion',
          degradedReason: 'Test pending deletion',
        },
        'sync-key-epochs': {
          status: 'unavailable',
          summary: 'Injected unavailable sync state',
          degradedReason: 'Test unavailable sync',
        },
      },
      now: () => new Date('2026-07-19T12:00:00.000Z'),
    });

    const byId = Object.fromEntries(snapshot.classes.map((entry) => [entry.id, entry]));
    expect(byId['connector-access']?.status).toBe('stale');
    expect(byId['connector-access']?.degradedReason).toContain('stale');
    expect(byId['action-audit-integrity']?.status).toBe('tampered');
    expect(byId['export-retention-deletion']?.status).toBe('pending');
    expect(byId['sync-key-epochs']?.status).toBe('unavailable');
    expect(snapshot.degradedCount).toBeGreaterThanOrEqual(4);
    expect(isProofCenterOfflineAcceptable(snapshot)).toBe(true);
  });
});
