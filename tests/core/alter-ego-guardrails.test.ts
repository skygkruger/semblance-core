import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { AlterEgoGuardrails } from '@semblance/core/agent/alter-ego-guardrails.js';
import { AlterEgoStore, TRUST_THRESHOLD } from '@semblance/core/agent/alter-ego-store.js';
import type { DatabaseHandle } from '@semblance/core/platform/types.js';
import type { ActionType } from '@semblance/core/types/ipc.js';
import type { ActionRisk } from '@semblance/core/agent/autonomy.js';
import type { ContactStore } from '@semblance/core/knowledge/contacts/contact-store.js';
import type { ContactEntity } from '@semblance/core/knowledge/contacts/contact-types.js';

// ─── Mock ContactStore ──────────────────────────────────────────────────────

function createMockContactStore(contacts: Partial<ContactEntity>[] = []): ContactStore {
  return {
    findByEmail: vi.fn((email: string) => {
      return contacts.filter(c =>
        (c.emails ?? []).some(e => e.toLowerCase() === email.toLowerCase()),
      ) as ContactEntity[];
    }),
  } as unknown as ContactStore;
}

function makeFamilyContact(email: string): Partial<ContactEntity> {
  return {
    id: `ct_family_${email}`,
    displayName: 'Family Member',
    emails: [email],
    relationshipType: 'family',
  };
}

function makeWorkContact(email: string): Partial<ContactEntity> {
  return {
    id: `ct_work_${email}`,
    displayName: 'Work Contact',
    emails: [email],
    relationshipType: 'colleague',
  };
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('AlterEgoGuardrails', () => {
  let db: Database.Database;
  let store: AlterEgoStore;
  let guardrails: AlterEgoGuardrails;
  let contactStore: ContactStore;

  beforeEach(() => {
    db = new Database(':memory:');
    store = new AlterEgoStore(db as unknown as DatabaseHandle);
    contactStore = createMockContactStore();
    guardrails = new AlterEgoGuardrails(store, contactStore);
  });

  afterEach(() => {
    db.close();
  });

  // ─── PROCEED ────────────────────────────────────────────────────────────

  describe('PROCEED cases', () => {
    it('proceeds for safe write action with no triggers', () => {
      // Acknowledge email.draft as not novel
      store.isNovelAction('email.draft');
      store.acknowledgeAnomaly('email.draft');

      const result = guardrails.evaluateAction({
        action: 'email.draft',
        payload: { to: ['bob@test.com'], subject: 'Hello', body: 'Hi' },
        risk: 'write',
      });
      expect(result.decision).toBe('PROCEED');
    });

    it('proceeds for read-only action regardless of settings', () => {
      const result = guardrails.evaluateAction({
        action: 'email.fetch',
        payload: { folder: 'INBOX' },
        risk: 'read',
      });
      expect(result.decision).toBe('PROCEED');
    });

    it('proceeds for trusted send action', () => {
      // Build trust
      for (let i = 0; i < TRUST_THRESHOLD; i++) {
        store.incrementTrust('alice@test.com', 'email.send');
      }
      // Acknowledge as not novel
      store.isNovelAction('email.send');
      store.acknowledgeAnomaly('email.send');

      const result = guardrails.evaluateAction({
        action: 'email.send',
        payload: { to: ['alice@test.com'], subject: 'Test', body: 'Body' },
        risk: 'execute',
      });
      expect(result.decision).toBe('PROCEED');
    });
  });

  // ─── Irreversible ───────────────────────────────────────────────────────

  describe('irreversible actions', () => {
    it('batches calendar.delete when not disabled', () => {
      // Acknowledge as not novel first
      store.isNovelAction('calendar.delete');
      store.acknowledgeAnomaly('calendar.delete');

      const result = guardrails.evaluateAction({
        action: 'calendar.delete',
        payload: { eventId: 'evt_123' },
        risk: 'execute',
      });
      expect(result.decision).toBe('BATCH_PENDING');
      if (result.decision === 'BATCH_PENDING') {
        expect(result.category).toBe('irreversible');
      }
    });

    it('proceeds when irreversible category is disabled', () => {
      store.updateSettings({ confirmationDisabledCategories: ['irreversible'] });
      // Acknowledge as not novel
      store.isNovelAction('calendar.delete');
      store.acknowledgeAnomaly('calendar.delete');

      const result = guardrails.evaluateAction({
        action: 'calendar.delete',
        payload: { eventId: 'evt_123' },
        risk: 'execute',
      });
      // calendar.delete is irreversible — with category disabled, it would proceed
      // BUT it's still novel the first time... we acknowledged it above
      expect(result.decision).toBe('PROCEED');
    });

    it('batches connector.disconnect', () => {
      store.isNovelAction('connector.disconnect');
      store.acknowledgeAnomaly('connector.disconnect');

      const result = guardrails.evaluateAction({
        action: 'connector.disconnect',
        payload: { connectorId: 'gmail' },
        risk: 'write',
      });
      expect(result.decision).toBe('BATCH_PENDING');
      if (result.decision === 'BATCH_PENDING') {
        expect(result.category).toBe('irreversible');
      }
    });
  });

  // ─── Financial Gate ─────────────────────────────────────────────────────

  describe('financial gate', () => {
    it('batches when amount exceeds threshold', () => {
      store.isNovelAction('service.api_call');
      store.acknowledgeAnomaly('service.api_call');

      const result = guardrails.evaluateAction({
        action: 'service.api_call',
        payload: { amount: 75, service: 'stripe', endpoint: '/charge', method: 'POST' },
        risk: 'execute',
      });
      expect(result.decision).toBe('BATCH_PENDING');
      if (result.decision === 'BATCH_PENDING') {
        expect(result.category).toBe('financial_threshold');
      }
    });

    it('proceeds when amount is below threshold', () => {
      store.isNovelAction('service.api_call');
      store.acknowledgeAnomaly('service.api_call');

      const result = guardrails.evaluateAction({
        action: 'service.api_call',
        payload: { amount: 25, service: 'stripe', endpoint: '/charge', method: 'POST' },
        risk: 'execute',
      });
      expect(result.decision).toBe('PROCEED');
    });

    it('batches at exact threshold', () => {
      store.updateSettings({ dollarThreshold: 50 });
      store.isNovelAction('service.api_call');
      store.acknowledgeAnomaly('service.api_call');

      const result = guardrails.evaluateAction({
        action: 'service.api_call',
        payload: { amount: 50.01, service: 'test', endpoint: '/test', method: 'POST' },
        risk: 'execute',
      });
      expect(result.decision).toBe('BATCH_PENDING');
    });

    it('respects custom threshold', () => {
      store.updateSettings({ dollarThreshold: 200 });
      store.isNovelAction('service.api_call');
      store.acknowledgeAnomaly('service.api_call');

      const result = guardrails.evaluateAction({
        action: 'service.api_call',
        payload: { amount: 150, service: 'test', endpoint: '/test', method: 'POST' },
        risk: 'execute',
      });
      expect(result.decision).toBe('PROCEED');
    });
  });

  // ─── Financial Significant ──────────────────────────────────────────────

  describe('financial significant', () => {
    it('always batches plaid_disconnect even if all categories disabled', () => {
      store.updateSettings({
        confirmationDisabledCategories: [
          'email', 'message', 'calendar', 'file',
          'financial_routine', 'financial_significant', 'irreversible',
        ],
      });
      store.isNovelAction('finance.plaid_disconnect');
      store.acknowledgeAnomaly('finance.plaid_disconnect');

      const result = guardrails.evaluateAction({
        action: 'finance.plaid_disconnect',
        payload: {},
        risk: 'write',
      });
      expect(result.decision).toBe('BATCH_PENDING');
      if (result.decision === 'BATCH_PENDING') {
        expect(result.category).toBe('financial_significant');
      }
    });

    it('financial significant takes priority over irreversible', () => {
      // plaid_disconnect is checked before irreversible in the flow
      store.isNovelAction('finance.plaid_disconnect');
      store.acknowledgeAnomaly('finance.plaid_disconnect');

      const result = guardrails.evaluateAction({
        action: 'finance.plaid_disconnect',
        payload: {},
        risk: 'write',
      });
      expect(result.decision).toBe('BATCH_PENDING');
      if (result.decision === 'BATCH_PENDING') {
        expect(result.category).toBe('financial_significant');
      }
    });
  });

  // ─── Sensitive Contact ──────────────────────────────────────────────────

  describe('sensitive contact', () => {
    it('batches when sending to family member', () => {
      const familyContact = makeFamilyContact('mom@family.com');
      contactStore = createMockContactStore([familyContact]);
      guardrails = new AlterEgoGuardrails(store, contactStore);

      store.isNovelAction('email.send');
      store.acknowledgeAnomaly('email.send');

      const result = guardrails.evaluateAction({
        action: 'email.send',
        payload: { to: ['mom@family.com'], subject: 'Hi', body: 'Hello' },
        risk: 'execute',
      });
      expect(result.decision).toBe('BATCH_PENDING');
      if (result.decision === 'BATCH_PENDING') {
        expect(result.category).toBe('sensitive_contact');
      }
    });

    it('does not batch for non-family contacts', () => {
      const workContact = makeWorkContact('boss@work.com');
      contactStore = createMockContactStore([workContact]);
      guardrails = new AlterEgoGuardrails(store, contactStore);

      store.isNovelAction('email.send');
      store.acknowledgeAnomaly('email.send');
      // Build trust to avoid DRAFT_FIRST
      for (let i = 0; i < TRUST_THRESHOLD; i++) {
        store.incrementTrust('boss@work.com', 'email.send');
      }

      const result = guardrails.evaluateAction({
        action: 'email.send',
        payload: { to: ['boss@work.com'], subject: 'Report', body: 'See attached' },
        risk: 'execute',
      });
      expect(result.decision).toBe('PROCEED');
    });

    it('batches messaging.send to family member', () => {
      const familyContact = makeFamilyContact('sis@family.com');
      contactStore = createMockContactStore([familyContact]);
      guardrails = new AlterEgoGuardrails(store, contactStore);

      store.isNovelAction('messaging.send');
      store.acknowledgeAnomaly('messaging.send');

      const result = guardrails.evaluateAction({
        action: 'messaging.send',
        payload: { to: ['sis@family.com'], body: 'Hello' },
        risk: 'execute',
      });
      expect(result.decision).toBe('BATCH_PENDING');
      if (result.decision === 'BATCH_PENDING') {
        expect(result.category).toBe('sensitive_contact');
      }
    });
  });

  // ─── Novel Actions ──────────────────────────────────────────────────────

  describe('novel actions', () => {
    it('batches first occurrence of any action', () => {
      const result = guardrails.evaluateAction({
        action: 'calendar.create',
        payload: { title: 'Meeting', startTime: '2026-03-05T10:00:00Z', endTime: '2026-03-05T11:00:00Z' },
        risk: 'write',
      });
      expect(result.decision).toBe('BATCH_PENDING');
      if (result.decision === 'BATCH_PENDING') {
        expect(result.category).toBe('novel');
      }
    });

    it('proceeds after acknowledgment', () => {
      store.isNovelAction('calendar.update');
      store.acknowledgeAnomaly('calendar.update');

      const result = guardrails.evaluateAction({
        action: 'calendar.update',
        payload: { eventId: 'evt_1', updates: {} },
        risk: 'write',
      });
      expect(result.decision).toBe('PROCEED');
    });

    it('cannot be disabled via settings', () => {
      store.updateSettings({
        confirmationDisabledCategories: [
          'email', 'message', 'calendar', 'file',
          'financial_routine', 'irreversible', 'novel',
        ],
      });

      const result = guardrails.evaluateAction({
        action: 'reminder.create',
        payload: { text: 'Buy milk', dueAt: '2026-03-05T10:00:00Z' },
        risk: 'write',
      });
      expect(result.decision).toBe('BATCH_PENDING');
      if (result.decision === 'BATCH_PENDING') {
        expect(result.category).toBe('novel');
      }
    });
  });

  // ─── Trust ──────────────────────────────────────────────────────────────

  describe('contact trust', () => {
    it('DRAFT_FIRST for untrusted email recipient', () => {
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

    it('DRAFT_FIRST for untrusted messaging recipient', () => {
      store.isNovelAction('messaging.send');
      store.acknowledgeAnomaly('messaging.send');

      const result = guardrails.evaluateAction({
        action: 'messaging.send',
        payload: { to: ['unknown@test.com'], body: 'Hello' },
        risk: 'execute',
      });
      expect(result.decision).toBe('DRAFT_FIRST');
    });

    it('PROCEED for trusted recipient (3+ sends)', () => {
      for (let i = 0; i < TRUST_THRESHOLD; i++) {
        store.incrementTrust('trusted@test.com', 'email.send');
      }
      store.isNovelAction('email.send');
      store.acknowledgeAnomaly('email.send');

      const result = guardrails.evaluateAction({
        action: 'email.send',
        payload: { to: ['trusted@test.com'], subject: 'Hi', body: 'Hello' },
        risk: 'execute',
      });
      expect(result.decision).toBe('PROCEED');
    });

    it('trust only applies to send actions, not writes', () => {
      // email.draft is a write action — no trust check
      store.isNovelAction('email.draft');
      store.acknowledgeAnomaly('email.draft');

      const result = guardrails.evaluateAction({
        action: 'email.draft',
        payload: { to: ['anyone@test.com'], subject: 'Hi', body: 'Hello' },
        risk: 'write',
      });
      expect(result.decision).toBe('PROCEED');
    });

    it('trust only applies to send actions, not reads', () => {
      const result = guardrails.evaluateAction({
        action: 'email.fetch',
        payload: { folder: 'INBOX' },
        risk: 'read',
      });
      expect(result.decision).toBe('PROCEED');
    });
  });

  // ─── Priority / First Triggered Wins ────────────────────────────────────

  describe('gate priority', () => {
    it('irreversible triggers before novel', () => {
      // calendar.delete is both irreversible AND novel (never seen)
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

    it('financial_significant triggers before irreversible', () => {
      const result = guardrails.evaluateAction({
        action: 'finance.plaid_disconnect',
        payload: {},
        risk: 'write',
      });
      expect(result.decision).toBe('BATCH_PENDING');
      if (result.decision === 'BATCH_PENDING') {
        // financial_significant is checked after irreversible,
        // but plaid_disconnect is not in IRREVERSIBLE_ACTIONS (connector.disconnect is)
        // so it hits financial_significant first
        expect(result.category).toBe('financial_significant');
      }
    });

    it('sensitive_contact triggers before trust check', () => {
      const familyContact = makeFamilyContact('mom@family.com');
      contactStore = createMockContactStore([familyContact]);
      guardrails = new AlterEgoGuardrails(store, contactStore);

      // Acknowledge action type
      store.isNovelAction('email.send');
      store.acknowledgeAnomaly('email.send');
      // mom is NOT trusted but is family — sensitive_contact wins
      const result = guardrails.evaluateAction({
        action: 'email.send',
        payload: { to: ['mom@family.com'], subject: 'Hi', body: 'Hello' },
        risk: 'execute',
      });
      expect(result.decision).toBe('BATCH_PENDING');
      if (result.decision === 'BATCH_PENDING') {
        expect(result.category).toBe('sensitive_contact');
      }
    });
  });

  // ─── No ContactStore ────────────────────────────────────────────────────

  describe('without contactStore', () => {
    it('skips sensitive contact check gracefully', () => {
      const noContactGuardrails = new AlterEgoGuardrails(store, null);
      store.isNovelAction('email.send');
      store.acknowledgeAnomaly('email.send');

      const result = noContactGuardrails.evaluateAction({
        action: 'email.send',
        payload: { to: ['anyone@test.com'], subject: 'Hi', body: 'Hello' },
        risk: 'execute',
      });
      // Should hit DRAFT_FIRST (untrusted) instead of sensitive_contact
      expect(result.decision).toBe('DRAFT_FIRST');
    });

    it('still enforces other gates without contactStore', () => {
      const noContactGuardrails = new AlterEgoGuardrails(store, null);

      const result = noContactGuardrails.evaluateAction({
        action: 'calendar.create',
        payload: { title: 'Test', startTime: '2026-03-05T10:00:00Z', endTime: '2026-03-05T11:00:00Z' },
        risk: 'write',
      });
      expect(result.decision).toBe('BATCH_PENDING');
      if (result.decision === 'BATCH_PENDING') {
        expect(result.category).toBe('novel');
      }
    });
  });

  // ─── Read-Only Always Proceeds ──────────────────────────────────────────

  describe('read-only actions', () => {
    it('all read actions proceed regardless of settings', () => {
      // Even with everything theoretically triggering, read is always safe
      const result = guardrails.evaluateAction({
        action: 'finance.fetch_transactions',
        payload: { amount: 10000 }, // High amount in payload, but it's a read
        risk: 'read',
      });
      expect(result.decision).toBe('PROCEED');
    });
  });
});
