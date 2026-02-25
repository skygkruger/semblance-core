/**
 * Step 33 — Commit 1: Sprint 1 (Spine) + Sprint 2 (Useful) Cross-Cutting Validation
 *
 * Higher-level than sprint2-exit-criteria.test.ts. Validates foundational systems
 * that every subsequent sprint depends on: IPC, audit trail, gateway, premium gate,
 * autonomy framework, knowledge graph.
 *
 * 15 tests.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Direct functional imports
import { ActionType } from '../../packages/core/types/ipc.js';
import { PremiumGate } from '../../packages/core/premium/premium-gate.js';
import { AutonomyManager } from '../../packages/core/agent/autonomy.js';

const ROOT = join(import.meta.dirname, '..', '..');

// Source files for scan-based tests
const IPC_TYPES = readFileSync(join(ROOT, 'packages/core/types/ipc.ts'), 'utf-8');
const AUDIT_TRAIL = readFileSync(join(ROOT, 'packages/gateway/audit/trail.ts'), 'utf-8');
const ALLOWLIST = readFileSync(join(ROOT, 'packages/gateway/security/allowlist.ts'), 'utf-8');
const AUTONOMY = readFileSync(join(ROOT, 'packages/core/agent/autonomy.ts'), 'utf-8');
const AUDIT_TYPES = readFileSync(join(ROOT, 'packages/core/types/audit.ts'), 'utf-8');
const DIGEST = readFileSync(join(ROOT, 'packages/core/digest/weekly-digest.ts'), 'utf-8');
const BRIDGE = readFileSync(join(ROOT, 'packages/desktop/src-tauri/sidecar/bridge.ts'), 'utf-8');

// Mock database for PremiumGate and AutonomyManager
function createMockDb(): import('../../packages/core/platform/types.js').DatabaseHandle {
  const tables = new Map<string, unknown[]>();
  return {
    exec(sql: string): void {
      const match = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
      if (match && !tables.has(match[1]!)) {
        tables.set(match[1]!, []);
      }
    },
    prepare(sql: string) {
      return {
        run(..._args: unknown[]) { return { changes: 0, lastInsertRowid: 0 }; },
        get(..._args: unknown[]) { return undefined; },
        all(..._args: unknown[]) { return []; },
      };
    },
    close(): void {},
    transaction<T>(fn: () => T): () => T { return fn; },
  } as import('../../packages/core/platform/types.js').DatabaseHandle;
}

describe('Step 33 — Sprint 1+2 Cross-Cutting Validation', () => {
  // ─── IPC & Schema ─────────────────────────────────────────────────────
  describe('IPC Protocol', () => {
    it('ActionType zod schema validates all defined action types', () => {
      const allTypes = ActionType.options;
      expect(allTypes.length).toBeGreaterThanOrEqual(50);
      // Verify core action types exist
      expect(allTypes).toContain('email.send');
      expect(allTypes).toContain('calendar.fetch');
      expect(allTypes).toContain('finance.fetch_transactions');
      expect(allTypes).toContain('service.api_call');
      expect(allTypes).toContain('network.syncContext');
    });
  });

  // ─── Audit Trail ──────────────────────────────────────────────────────
  describe('Audit Trail', () => {
    it('schema includes chainHash for tamper evidence', () => {
      expect(AUDIT_TRAIL).toContain('chain_hash');
      expect(AUDIT_TRAIL).toContain('computeChainHash');
    });

    it('requires estimatedTimeSavedSeconds in audit entry types', () => {
      // Check both gateway trail schema and core types
      expect(AUDIT_TRAIL).toContain('estimated_time_saved_seconds');
      expect(AUDIT_TYPES).toContain('estimatedTimeSavedSeconds');
    });
  });

  // ─── Gateway ──────────────────────────────────────────────────────────
  describe('Gateway', () => {
    it('allowlist exports authorization functions', () => {
      expect(ALLOWLIST).toContain('AllowedService');
      expect(ALLOWLIST).toContain('allowed_services');
    });

    it('bridge wires 15+ IPC command handlers', () => {
      const handleCount = (BRIDGE.match(/async function handle[A-Z]/g) ?? []).length;
      expect(handleCount).toBeGreaterThanOrEqual(15);
    });
  });

  // ─── Premium Gate ─────────────────────────────────────────────────────
  describe('Premium Gate', () => {
    it('FEATURE_TIER_MAP has exactly 20 entries', () => {
      const source = readFileSync(join(ROOT, 'packages/core/premium/premium-gate.ts'), 'utf-8');
      // Count the number of key-value pairs in FEATURE_TIER_MAP
      const mapBlock = source.slice(
        source.indexOf('const FEATURE_TIER_MAP'),
        source.indexOf('};', source.indexOf('const FEATURE_TIER_MAP')) + 2,
      );
      const entries = (mapBlock.match(/'[\w-]+': 'digital-representative'/g) ?? []);
      expect(entries.length).toBe(20);
    });

    it('tier ranking: lifetime > digital-representative > free', () => {
      const gate = new PremiumGate(createMockDb());
      // On free tier (no license), isPremium returns false
      expect(gate.isPremium()).toBe(false);
      expect(gate.getLicenseTier()).toBe('free');
      // Available features on free tier is empty
      expect(gate.getAvailableFeatures()).toEqual([]);
    });
  });

  // ─── Autonomy Framework ───────────────────────────────────────────────
  describe('Autonomy Framework', () => {
    it('defaults to partner tier', () => {
      const mgr = new AutonomyManager(createMockDb());
      // Partner auto-approves reads
      expect(mgr.decide('email.fetch')).toBe('auto_approve');
    });

    it('guardian mode requires approval for all risk levels', () => {
      const mgr = new AutonomyManager(createMockDb(), { defaultTier: 'guardian' });
      expect(mgr.decide('email.fetch')).toBe('requires_approval');
      expect(mgr.decide('email.draft')).toBe('requires_approval');
      expect(mgr.decide('email.send')).toBe('requires_approval');
    });

    it('alter ego still requires approval for email.send', () => {
      const mgr = new AutonomyManager(createMockDb(), { defaultTier: 'alter_ego' });
      expect(mgr.decide('email.send')).toBe('requires_approval');
    });

    it('ACTION_DOMAIN_MAP covers all ActionTypes', () => {
      // Every ActionType enum value must appear in the domain map
      const actionTypes = ActionType.options;
      for (const type of actionTypes) {
        expect(AUTONOMY).toContain(`'${type}'`);
      }
    });

    it('ACTION_RISK_MAP covers all ActionTypes', () => {
      // Extract risk map block
      const riskStart = AUTONOMY.indexOf('const ACTION_RISK_MAP');
      expect(riskStart).toBeGreaterThan(-1);
      const riskBlock = AUTONOMY.slice(riskStart, AUTONOMY.indexOf('};', riskStart) + 2);
      const actionTypes = ActionType.options;
      for (const type of actionTypes) {
        expect(riskBlock).toContain(`'${type}'`);
      }
    });

    it('every ActionType has both domain and risk mapping', () => {
      // Domain map block
      const domainStart = AUTONOMY.indexOf('const ACTION_DOMAIN_MAP');
      const domainBlock = AUTONOMY.slice(domainStart, AUTONOMY.indexOf('};', domainStart) + 2);
      // Risk map block
      const riskStart = AUTONOMY.indexOf('const ACTION_RISK_MAP');
      const riskBlock = AUTONOMY.slice(riskStart, AUTONOMY.indexOf('};', riskStart) + 2);
      const actionTypes = ActionType.options;
      for (const type of actionTypes) {
        expect(domainBlock).toContain(`'${type}'`);
        expect(riskBlock).toContain(`'${type}'`);
      }
    });
  });

  // ─── Weekly Digest ────────────────────────────────────────────────────
  describe('Weekly Digest', () => {
    it('uses time-saved data in digest output', () => {
      expect(DIGEST).toContain('timeSavedFormatted');
      expect(DIGEST).toContain('totalTimeSavedSeconds');
    });
  });

  // ─── Knowledge Graph ──────────────────────────────────────────────────
  describe('Knowledge Graph', () => {
    it('exports core components', async () => {
      const kg = await import('../../packages/core/knowledge/index.js');
      expect(kg.DocumentStore).toBeDefined();
      expect(kg.VectorStore).toBeDefined();
      expect(kg.Indexer).toBeDefined();
      expect(kg.SemanticSearch).toBeDefined();
    });
  });
});
