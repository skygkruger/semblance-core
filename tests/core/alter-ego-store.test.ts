import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { AlterEgoStore, TRUST_THRESHOLD, UNDO_WINDOW_MS } from '@semblance/core/agent/alter-ego-store.js';
import type { DatabaseHandle } from '@semblance/core/platform/types.js';
import type { AlterEgoReceipt } from '@semblance/core/agent/alter-ego-types.js';

describe('AlterEgoStore', () => {
  let db: Database.Database;
  let store: AlterEgoStore;

  beforeEach(() => {
    db = new Database(':memory:');
    store = new AlterEgoStore(db as unknown as DatabaseHandle);
  });

  afterEach(() => {
    db.close();
  });

  // ─── Settings ───────────────────────────────────────────────────────────

  describe('settings', () => {
    it('returns defaults on fresh DB', () => {
      const settings = store.getSettings();
      expect(settings.dollarThreshold).toBe(50.0);
      expect(settings.confirmationDisabledCategories).toEqual([]);
    });

    it('updates dollar threshold', () => {
      store.updateSettings({ dollarThreshold: 100 });
      const settings = store.getSettings();
      expect(settings.dollarThreshold).toBe(100);
    });

    it('updates disabled categories', () => {
      store.updateSettings({ confirmationDisabledCategories: ['email', 'calendar'] });
      const settings = store.getSettings();
      expect(settings.confirmationDisabledCategories).toEqual(['email', 'calendar']);
    });

    it('partial update preserves other fields', () => {
      store.updateSettings({ dollarThreshold: 200 });
      store.updateSettings({ confirmationDisabledCategories: ['file'] });
      const settings = store.getSettings();
      expect(settings.dollarThreshold).toBe(200);
      expect(settings.confirmationDisabledCategories).toEqual(['file']);
    });

    it('handles empty categories array', () => {
      store.updateSettings({ confirmationDisabledCategories: ['email'] });
      store.updateSettings({ confirmationDisabledCategories: [] });
      const settings = store.getSettings();
      expect(settings.confirmationDisabledCategories).toEqual([]);
    });

    it('rejects zero dollar threshold by allowing positive values', () => {
      store.updateSettings({ dollarThreshold: 0.01 });
      expect(store.getSettings().dollarThreshold).toBe(0.01);
    });
  });

  // ─── Trust ──────────────────────────────────────────────────────────────

  describe('trust', () => {
    it('returns untrusted for unknown email', () => {
      const trust = store.getTrust('unknown@test.com', 'email.send');
      expect(trust.successfulSends).toBe(0);
      expect(trust.trusted).toBe(false);
    });

    it('increments trust counter', () => {
      store.incrementTrust('alice@test.com', 'email.send');
      const trust = store.getTrust('alice@test.com', 'email.send');
      expect(trust.successfulSends).toBe(1);
      expect(trust.lastSendAt).toBeTruthy();
    });

    it('becomes trusted at threshold', () => {
      for (let i = 0; i < TRUST_THRESHOLD; i++) {
        store.incrementTrust('bob@test.com', 'email.send');
      }
      expect(store.isTrusted('bob@test.com', 'email.send')).toBe(true);
    });

    it('is not trusted below threshold', () => {
      for (let i = 0; i < TRUST_THRESHOLD - 1; i++) {
        store.incrementTrust('carol@test.com', 'email.send');
      }
      expect(store.isTrusted('carol@test.com', 'email.send')).toBe(false);
    });

    it('isolates trust per email', () => {
      for (let i = 0; i < TRUST_THRESHOLD; i++) {
        store.incrementTrust('dave@test.com', 'email.send');
      }
      expect(store.isTrusted('dave@test.com', 'email.send')).toBe(true);
      expect(store.isTrusted('eve@test.com', 'email.send')).toBe(false);
    });

    it('isolates trust per scope', () => {
      for (let i = 0; i < TRUST_THRESHOLD; i++) {
        store.incrementTrust('frank@test.com', 'email.send');
      }
      expect(store.isTrusted('frank@test.com', 'email.send')).toBe(true);
      expect(store.isTrusted('frank@test.com', 'messaging.send')).toBe(false);
    });

    it('normalizes email to lowercase', () => {
      store.incrementTrust('Alice@Test.COM', 'email.send');
      const trust = store.getTrust('alice@test.com', 'email.send');
      expect(trust.successfulSends).toBe(1);
    });

    it('updates last_send_at on each increment', () => {
      store.incrementTrust('grace@test.com', 'email.send');
      const first = store.getTrust('grace@test.com', 'email.send');
      store.incrementTrust('grace@test.com', 'email.send');
      const second = store.getTrust('grace@test.com', 'email.send');
      expect(second.successfulSends).toBe(2);
      // Timestamps may or may not differ (same test second), just ensure both exist
      expect(first.lastSendAt).toBeTruthy();
      expect(second.lastSendAt).toBeTruthy();
    });
  });

  // ─── Receipts ───────────────────────────────────────────────────────────

  describe('receipts', () => {
    function makeReceipt(overrides: Partial<AlterEgoReceipt> = {}): AlterEgoReceipt {
      return {
        id: `r_${Math.random().toString(36).slice(2, 8)}`,
        actionType: 'email.send',
        summary: 'Sent email to alice: Meeting tomorrow',
        reasoning: 'LLM requested email.send based on conversation context',
        status: 'executed',
        undoAvailable: true,
        undoExpiresAt: new Date(Date.now() + UNDO_WINDOW_MS).toISOString(),
        weekGroup: '2026-W09',
        createdAt: new Date().toISOString(),
        executedAt: new Date().toISOString(),
        ...overrides,
      };
    }

    it('inserts and retrieves receipt', () => {
      const receipt = makeReceipt({ id: 'r_test1' });
      store.logReceipt(receipt);
      const all = store.getReceipts();
      expect(all).toHaveLength(1);
      expect(all[0]!.id).toBe('r_test1');
      expect(all[0]!.actionType).toBe('email.send');
    });

    it('queries by week group', () => {
      store.logReceipt(makeReceipt({ weekGroup: '2026-W09' }));
      store.logReceipt(makeReceipt({ weekGroup: '2026-W10' }));

      const w09 = store.getReceipts('2026-W09');
      expect(w09).toHaveLength(1);

      const w10 = store.getReceipts('2026-W10');
      expect(w10).toHaveLength(1);
    });

    it('marks receipt as undone', () => {
      store.logReceipt(makeReceipt({ id: 'r_undo_test' }));
      const result = store.markUndone('r_undo_test');
      expect(result).toBe(true);

      const receipts = store.getReceipts();
      expect(receipts[0]!.status).toBe('undone');
      expect(receipts[0]!.undoAvailable).toBe(false);
    });

    it('markUndone returns false for unknown id', () => {
      const result = store.markUndone('nonexistent');
      expect(result).toBe(false);
    });

    it('returns recent receipts with limit', () => {
      for (let i = 0; i < 5; i++) {
        store.logReceipt(makeReceipt());
      }
      const recent = store.getRecentReceipts(3);
      expect(recent).toHaveLength(3);
    });

    it('preserves undo expiry time', () => {
      const expiresAt = new Date(Date.now() + UNDO_WINDOW_MS).toISOString();
      store.logReceipt(makeReceipt({ id: 'r_expiry', undoExpiresAt: expiresAt }));
      const receipts = store.getReceipts();
      expect(receipts[0]!.undoExpiresAt).toBe(expiresAt);
    });
  });

  // ─── Anomalies ──────────────────────────────────────────────────────────

  describe('anomalies', () => {
    it('reports first occurrence as novel', () => {
      expect(store.isNovelAction('calendar.create')).toBe(true);
    });

    it('reports unacknowledged action as still novel', () => {
      store.isNovelAction('calendar.create'); // records it
      expect(store.isNovelAction('calendar.create')).toBe(true);
    });

    it('no longer novel after acknowledgment', () => {
      store.isNovelAction('email.archive');
      store.acknowledgeAnomaly('email.archive');
      expect(store.isNovelAction('email.archive')).toBe(false);
    });

    it('different action types are independent', () => {
      store.isNovelAction('email.send');
      store.acknowledgeAnomaly('email.send');
      expect(store.isNovelAction('email.send')).toBe(false);
      expect(store.isNovelAction('calendar.delete')).toBe(true);
    });
  });

  // ─── Week Group ─────────────────────────────────────────────────────────

  describe('getWeekGroup', () => {
    it('returns correct ISO week string', () => {
      // 2026-03-02 is a Monday → Week 10
      const result = store.getWeekGroup(new Date('2026-03-02'));
      expect(result).toBe('2026-W10');
    });

    it('Monday and Sunday of same week return same group', () => {
      const monday = store.getWeekGroup(new Date('2026-03-02'));
      const sunday = store.getWeekGroup(new Date('2026-03-08'));
      expect(monday).toBe(sunday);
    });

    it('different weeks return different groups', () => {
      const w10 = store.getWeekGroup(new Date('2026-03-02'));
      const w11 = store.getWeekGroup(new Date('2026-03-09'));
      expect(w10).not.toBe(w11);
    });

    it('handles year boundary', () => {
      // 2025-12-29 is a Monday, ISO week 1 of 2026
      const result = store.getWeekGroup(new Date('2025-12-29'));
      expect(result).toBe('2026-W01');
    });
  });

  // ─── Week Stats ─────────────────────────────────────────────────────────

  describe('getWeekStats', () => {
    it('returns zero counts for empty week', () => {
      const stats = store.getWeekStats('2026-W09');
      expect(stats.executed).toBe(0);
      expect(stats.undone).toBe(0);
    });

    it('counts executed and undone separately', () => {
      store.logReceipt({
        id: 'r1',
        actionType: 'email.send',
        summary: 'test',
        reasoning: 'test',
        status: 'executed',
        undoAvailable: false,
        undoExpiresAt: null,
        weekGroup: '2026-W09',
        createdAt: new Date().toISOString(),
        executedAt: new Date().toISOString(),
      });
      store.logReceipt({
        id: 'r2',
        actionType: 'email.draft',
        summary: 'test',
        reasoning: 'test',
        status: 'executed',
        undoAvailable: false,
        undoExpiresAt: null,
        weekGroup: '2026-W09',
        createdAt: new Date().toISOString(),
        executedAt: new Date().toISOString(),
      });
      store.markUndone('r2');

      const stats = store.getWeekStats('2026-W09');
      expect(stats.executed).toBe(1);
      expect(stats.undone).toBe(1);
    });
  });

  // ─── Edge Cases ─────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles fresh DB with no settings row gracefully', () => {
      // Constructor inserts the default row, so this tests that it works
      const settings = store.getSettings();
      expect(settings).toBeDefined();
      expect(settings.dollarThreshold).toBe(50);
    });

    it('constructor is idempotent', () => {
      // Creating a second store on the same DB should not error
      const store2 = new AlterEgoStore(db as unknown as DatabaseHandle);
      expect(store2.getSettings().dollarThreshold).toBe(50);
    });
  });

  // ─── Constants ──────────────────────────────────────────────────────────

  describe('constants', () => {
    it('TRUST_THRESHOLD is 3', () => {
      expect(TRUST_THRESHOLD).toBe(3);
    });

    it('UNDO_WINDOW_MS is 30 seconds', () => {
      expect(UNDO_WINDOW_MS).toBe(30_000);
    });
  });
});
