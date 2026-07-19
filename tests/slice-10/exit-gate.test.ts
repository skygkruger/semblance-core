import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  buildProofCenterSnapshot,
  isProofCenterOfflineAcceptable,
  PROOF_CLASS_DEFINITIONS,
} from '../../packages/core/proof-center/index.js';
import { buildTodaySnapshot } from '../../packages/core/agent/today/index.js';
import { createPlanStore } from '../../packages/core/agent/planning/plan-store.js';
import type { DatabaseHandle } from '../../packages/core/platform/types.js';
import { createInMemoryOutcomeLinker } from '../../packages/core/agent/proactive/outcome-linker.js';
import { createDomainVerticalRegistry } from '../../../semblence-representative/src/domain-verticals/registry.js';

function wrapDatabase(dbPath: string): DatabaseHandle {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  return {
    pragma: (s: string) => db.pragma(s),
    prepare: (sql: string) => {
      const stmt = db.prepare(sql);
      return {
        get: (...params: unknown[]) => stmt.get(...params),
        all: (...params: unknown[]) => stmt.all(...params),
        run: (...params: unknown[]) => stmt.run(...params),
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transaction: <T extends (...args: any[]) => any>(fn: T): T => {
      return db.transaction(fn as Parameters<typeof db.transaction>[0]) as unknown as T;
    },
    exec: (sql: string) => db.exec(sql),
    close: () => db.close(),
  };
}

function createPremiumGate(isPremium: boolean) {
  return {
    isPremium: () => isPremium,
  };
}

describe('Slice 10 exit gate — Today, Work, Proof, agency domains', () => {
  let tempDir: string;
  let documentsDb: DatabaseHandle;
  let prefsDb: DatabaseHandle;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'slice10-exit-'));
    documentsDb = wrapDatabase(join(tempDir, 'documents.db'));
    prefsDb = wrapDatabase(join(tempDir, 'prefs.db'));
    documentsDb.exec(`
      CREATE TABLE documents (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        source_path TEXT,
        title TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        indexed_at TEXT NOT NULL
      );
    `);
    prefsDb.exec(`
      CREATE TABLE pending_actions (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        payload TEXT NOT NULL,
        reasoning TEXT,
        domain TEXT,
        tier TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        executed_at TEXT,
        response_json TEXT
      );
    `);
  });

  afterEach(() => {
    documentsDb.close();
    prefsDb.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('Today snapshot works offline with empty vault — truthful empty', () => {
    const snapshot = buildTodaySnapshot({
      prefsDb,
      documentsDb,
      actionLifecycleStore: null,
      auditTrail: null,
      proactiveEngine: null,
      intentManager: null,
      representativeWorkflowStore: null,
      now: () => new Date('2026-07-19T12:00:00.000Z'),
    });

    expect(snapshot.isEmpty).toBe(true);
    expect(snapshot.inbox).toEqual({
      triage: [],
      pendingReplies: [],
      representativeActions: [],
    });
    expect(snapshot.changes).toEqual([]);
  });

  it('Work plans list works offline', () => {
    const planStore = createPlanStore(tempDir);
    const created = planStore.create({
      title: 'Slice 10 delegated plan',
      steps: [
        {
          id: 'step-1',
          title: 'Inspect proof classes',
          capability: 'proof.inspect',
          status: 'pending',
          dependsOn: [],
        },
      ],
    });

    const listed = planStore.list({ limit: 10, offset: 0 });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(created.id);
    expect(listed[0]?.title).toBe('Slice 10 delegated plan');
  });

  it('Proof center offline acceptance for all classes including degraded evidence', () => {
    const snapshot = buildProofCenterSnapshot({
      auditTrail: null,
      actionLifecycleStore: null,
      connectedServices: [],
      executionPolicy: {
        schemaVersion: 1,
        capabilityCount: 3,
        updatedAt: '2026-07-19T08:00:00.000Z',
      },
      executionReceipts: [],
      extensionStatus: { configured: false, loaded: false, manifestId: null, manifestHash: null },
      activeModel: { modelId: null, provider: null, inferenceEngine: null },
      entitlement: { active: false, entitlementId: null, tier: null, revocationEpoch: null },
      vouchers: { remainingCount: 0, lastRedeemedAt: null },
      syncDevices: null,
      deletionState: { pendingTombstones: 0, completedDeletions: 0, retentionPolicyId: null, lastExportAt: null },
      measurementPolicy: { version: '20260719', allowedWorkloads: 1 },
      injectedOverrides: {
        'connector-access': { status: 'stale', degradedReason: 'Exit gate stale connector fixture' },
        'action-audit-integrity': { status: 'tampered', degradedReason: 'Exit gate tampered audit fixture' },
        'export-retention-deletion': { status: 'pending', degradedReason: 'Exit gate pending deletion fixture' },
      },
      now: () => new Date('2026-07-19T12:00:00.000Z'),
    });

    expect(snapshot.classes).toHaveLength(PROOF_CLASS_DEFINITIONS.length);
    expect(isProofCenterOfflineAcceptable(snapshot)).toBe(true);
    expect(snapshot.classes.some((entry) => entry.status === 'stale')).toBe(true);
    expect(snapshot.classes.some((entry) => entry.status === 'tampered')).toBe(true);
    expect(snapshot.classes.some((entry) => entry.status === 'pending')).toBe(true);
    expect(snapshot.classes.some((entry) => entry.status === 'unavailable')).toBe(true);
  });

  it('each agency domain produces outcome and proof when premium allowed', async () => {
    const db = new Database(':memory:');
    const outcomeLinker = createInMemoryOutcomeLinker();
    const { runDomainVertical } = createDomainVerticalRegistry({
      db: db as unknown as DatabaseHandle,
      premiumGate: createPremiumGate(true) as never,
      outcomeLinker,
      followUpTracker: { getDueFollowUps: () => [] },
      bureaucracyTracker: { getDueReminders: () => [] },
      cancellationEngine: { listCancellable: async () => [] },
      correlationEngine: { computeCorrelations: async () => [] },
      weeklyDigestGenerator: { list: () => [] },
      alterEgoWeekEngine: {
        getState: () => ({ currentDay: 1, active: false, startedAt: null }),
      },
    });

    const domains = [
      'representative',
      'forms',
      'finance',
      'relationships',
      'defense',
      'health',
      'digest',
      'alter-ego',
    ] as const;

    for (const domain of domains) {
      const result = await runDomainVertical(domain, {});
      expect(result.success).toBe(true);
      expect(result.gated).toBe(false);
      expect(result.action?.auditRef).toBeTruthy();
      expect(result.linkId).toBeTruthy();
    }
  });

  it('proof aggregator has no network imports', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const root = join(import.meta.dirname, '../../packages/core/proof-center');
    const banned = [/\bfetch\s*\(/, /\bfrom\s+['"]node:http['"]/, /\bfrom\s+['"]node:https['"]/];
    const violations: string[] = [];

    function walk(dir: string): void {
      for (const entry of readdirSync(dir)) {
        const fullPath = join(dir, entry);
        if (statSync(fullPath).isDirectory()) {
          walk(fullPath);
        } else if (entry.endsWith('.ts')) {
          const content = readFileSync(fullPath, 'utf8');
          for (const pattern of banned) {
            if (pattern.test(content)) {
              violations.push(fullPath);
            }
          }
        }
      }
    }

    walk(root);
    expect(violations).toEqual([]);
  });

  it('Universal Inbox section is present on Today snapshot shape', () => {
    const snapshot = buildTodaySnapshot({
      prefsDb,
      documentsDb,
      actionLifecycleStore: null,
      auditTrail: null,
      proactiveEngine: null,
      intentManager: null,
      representativeWorkflowStore: null,
    });

    expect(snapshot.inbox).toBeDefined();
    expect(Array.isArray(snapshot.inbox.triage)).toBe(true);
    expect(Array.isArray(snapshot.inbox.pendingReplies)).toBe(true);
    expect(Array.isArray(snapshot.inbox.representativeActions)).toBe(true);
  });
});
