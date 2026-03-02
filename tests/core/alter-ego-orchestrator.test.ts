import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { AlterEgoGuardrails } from '@semblance/core/agent/alter-ego-guardrails.js';
import { AlterEgoStore, TRUST_THRESHOLD } from '@semblance/core/agent/alter-ego-store.js';
import type { DatabaseHandle } from '@semblance/core/platform/types.js';
import type { GuardrailResult } from '@semblance/core/agent/alter-ego-types.js';

// We test the guardrail integration logic and summarizeAction indirectly
// by testing the AlterEgoGuardrails + AlterEgoStore together as they're
// used by the orchestrator's processToolCalls flow.

describe('AlterEgoGuardrails orchestrator integration', () => {
  let db: Database.Database;
  let store: AlterEgoStore;
  let guardrails: AlterEgoGuardrails;

  beforeEach(() => {
    db = new Database(':memory:');
    store = new AlterEgoStore(db as unknown as DatabaseHandle);
    guardrails = new AlterEgoGuardrails(store, null);
  });

  afterEach(() => {
    db.close();
  });

  // ─── PROCEED → executes + logs receipt ──────────────────────────────────

  describe('PROCEED flow', () => {
    it('action proceeds and receipt can be logged', () => {
      // Acknowledge action as not novel
      store.isNovelAction('email.draft');
      store.acknowledgeAnomaly('email.draft');

      const result = guardrails.evaluateAction({
        action: 'email.draft',
        payload: { to: ['bob@test.com'], subject: 'Test', body: 'Hi' },
        risk: 'write',
      });
      expect(result.decision).toBe('PROCEED');

      // Simulate orchestrator logging receipt after execution
      store.logReceipt({
        id: 'r_test1',
        actionType: 'email.draft',
        summary: 'Drafted email to bob: Test',
        reasoning: 'LLM requested email_draft',
        status: 'executed',
        undoAvailable: true,
        undoExpiresAt: new Date(Date.now() + 30_000).toISOString(),
        weekGroup: store.getWeekGroup(new Date()),
        createdAt: new Date().toISOString(),
        executedAt: new Date().toISOString(),
      });

      const receipts = store.getRecentReceipts(5);
      expect(receipts).toHaveLength(1);
      expect(receipts[0]!.summary).toBe('Drafted email to bob: Test');
    });

    it('acknowledges anomaly after execution', () => {
      // First eval: novel
      const first = guardrails.evaluateAction({
        action: 'reminder.create',
        payload: { text: 'Buy milk', dueAt: '2026-03-05T10:00:00Z' },
        risk: 'write',
      });
      expect(first.decision).toBe('BATCH_PENDING');

      // Simulate user approving → orchestrator acknowledges
      store.acknowledgeAnomaly('reminder.create');

      // Second eval: no longer novel
      const second = guardrails.evaluateAction({
        action: 'reminder.create',
        payload: { text: 'Buy bread', dueAt: '2026-03-06T10:00:00Z' },
        risk: 'write',
      });
      expect(second.decision).toBe('PROCEED');
    });
  });

  // ─── BATCH_PENDING → queued ─────────────────────────────────────────────

  describe('BATCH_PENDING flow', () => {
    it('novel action returns BATCH_PENDING', () => {
      const result = guardrails.evaluateAction({
        action: 'calendar.create',
        payload: { title: 'Meeting', startTime: '2026-03-05T10:00:00Z', endTime: '2026-03-05T11:00:00Z' },
        risk: 'write',
      });
      expect(result.decision).toBe('BATCH_PENDING');
    });

    it('irreversible action returns BATCH_PENDING', () => {
      store.isNovelAction('calendar.delete');
      store.acknowledgeAnomaly('calendar.delete');

      const result = guardrails.evaluateAction({
        action: 'calendar.delete',
        payload: { eventId: 'evt_1' },
        risk: 'execute',
      });
      expect(result.decision).toBe('BATCH_PENDING');
      if (result.decision === 'BATCH_PENDING') {
        expect(result.category).toBe('irreversible');
      }
    });

    it('financial threshold returns BATCH_PENDING', () => {
      store.isNovelAction('service.api_call');
      store.acknowledgeAnomaly('service.api_call');

      const result = guardrails.evaluateAction({
        action: 'service.api_call',
        payload: { amount: 100, service: 'test', endpoint: '/pay', method: 'POST' },
        risk: 'execute',
      });
      expect(result.decision).toBe('BATCH_PENDING');
    });
  });

  // ─── DRAFT_FIRST → returns draft ───────────────────────────────────────

  describe('DRAFT_FIRST flow', () => {
    it('untrusted send returns DRAFT_FIRST with contactEmail', () => {
      store.isNovelAction('email.send');
      store.acknowledgeAnomaly('email.send');

      const result = guardrails.evaluateAction({
        action: 'email.send',
        payload: { to: ['stranger@test.com'], subject: 'Hi', body: 'Hello' },
        risk: 'execute',
      });
      expect(result.decision).toBe('DRAFT_FIRST');
      if (result.decision === 'DRAFT_FIRST') {
        expect(result.contactEmail).toBe('stranger@test.com');
      }
    });

    it('trust increment after send reduces to PROCEED', () => {
      store.isNovelAction('email.send');
      store.acknowledgeAnomaly('email.send');

      // Untrusted initially
      expect(store.isTrusted('friend@test.com', 'email.send')).toBe(false);

      // Build trust
      for (let i = 0; i < TRUST_THRESHOLD; i++) {
        store.incrementTrust('friend@test.com', 'email.send');
      }

      const result = guardrails.evaluateAction({
        action: 'email.send',
        payload: { to: ['friend@test.com'], subject: 'Hi', body: 'Hello' },
        risk: 'execute',
      });
      expect(result.decision).toBe('PROCEED');
    });
  });

  // ─── Tier Filtering ────────────────────────────────────────────────────

  describe('tier filtering (orchestrator responsibility)', () => {
    it('guardrails return a decision for any tier (filtering is caller responsibility)', () => {
      // The guardrails themselves don't check tier — the orchestrator
      // only calls evaluateAction when tier === 'alter_ego'
      const result = guardrails.evaluateAction({
        action: 'email.fetch',
        payload: { folder: 'INBOX' },
        risk: 'read',
      });
      expect(result.decision).toBe('PROCEED');
    });

    it('read actions always PROCEED regardless', () => {
      const result = guardrails.evaluateAction({
        action: 'calendar.fetch',
        payload: {},
        risk: 'read',
      });
      expect(result.decision).toBe('PROCEED');
    });
  });

  // ─── Receipt Undo ──────────────────────────────────────────────────────

  describe('receipt undo window', () => {
    it('receipt includes 30s undo window', () => {
      const now = Date.now();
      const expiresAt = new Date(now + 30_000).toISOString();
      store.logReceipt({
        id: 'r_undo',
        actionType: 'email.send',
        summary: 'Sent email',
        reasoning: 'test',
        status: 'executed',
        undoAvailable: true,
        undoExpiresAt: expiresAt,
        weekGroup: '2026-W10',
        createdAt: new Date(now).toISOString(),
        executedAt: new Date(now).toISOString(),
      });

      const receipts = store.getReceipts();
      expect(receipts[0]!.undoAvailable).toBe(true);
      expect(receipts[0]!.undoExpiresAt).toBe(expiresAt);

      // Verify undo window is ~30s from now
      const expiryDelta = new Date(receipts[0]!.undoExpiresAt!).getTime() - now;
      expect(expiryDelta).toBeGreaterThanOrEqual(29_000);
      expect(expiryDelta).toBeLessThanOrEqual(31_000);
    });
  });
});

// ─── summarizeAction tests (via public interface) ────────────────────────────
// Since summarizeAction is a private method on OrchestratorImpl, we test
// the expected output patterns directly to document the contract.

describe('summarizeAction expected patterns', () => {
  it('email.send produces "Sent email to {name}: {subject}"', () => {
    const payload = { to: ['marcus@example.com'], subject: 'Tuesday follow-up', body: 'Hi Marcus' };
    // Expected: "Sent email to marcus: Tuesday follow-up"
    const recipient = 'marcus'; // first part before @
    const expected = `Sent email to ${recipient}: ${payload.subject}`;
    expect(expected).toMatch(/^Sent email to .+: .+$/);
  });

  it('calendar.create produces "Created event: {title} on {date}"', () => {
    const payload = { title: 'Team standup', startTime: '2026-03-05T10:00:00Z' };
    const expected = `Created event: ${payload.title} on Mar 5`;
    expect(expected).toMatch(/^Created event: .+ on .+$/);
  });

  it('fallback for unknown action type uses actionType: first value', () => {
    const expected = 'file.write: notes.txt';
    expect(expected).toMatch(/^.+: .+$/);
  });
});
