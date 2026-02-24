/**
 * Step 27 — InheritanceConfigStore tests (Commit 1).
 * Tests schema creation, config defaults, party CRUD, action ordering,
 * template storage, and cascade delete.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { InheritanceConfigStore } from '@semblance/core/inheritance/inheritance-config-store';
import type { TrustedParty, InheritanceAction, NotificationTemplate } from '@semblance/core/inheritance/types';
import { nanoid } from 'nanoid';

let db: InstanceType<typeof Database>;
let store: InheritanceConfigStore;

function makeParty(overrides?: Partial<TrustedParty>): TrustedParty {
  const now = new Date().toISOString();
  return {
    id: `tp_${nanoid()}`,
    name: 'Alice Smith',
    email: 'alice@example.com',
    relationship: 'spouse',
    passphraseHash: 'abc123hash',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeAction(partyId: string, order: number, overrides?: Partial<InheritanceAction>): InheritanceAction {
  const now = new Date().toISOString();
  return {
    id: `ia_${nanoid()}`,
    partyId,
    category: 'notification',
    sequenceOrder: order,
    actionType: 'email.send',
    payload: { to: ['bob@example.com'], subject: 'Hello', body: 'Message' },
    label: `Action ${order}`,
    requiresDeletionConsensus: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeTemplate(partyId: string, actionId: string, overrides?: Partial<NotificationTemplate>): NotificationTemplate {
  const now = new Date().toISOString();
  return {
    id: `nt_${nanoid()}`,
    partyId,
    actionId,
    recipientName: 'Bob Jones',
    recipientEmail: 'bob@example.com',
    subject: 'An important message',
    body: 'Dear Bob, this is from me.',
    lastReviewedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  db = new Database(':memory:');
  store = new InheritanceConfigStore(db as unknown as DatabaseHandle);
  store.initSchema();
});

afterEach(() => {
  db.close();
});

describe('InheritanceConfigStore (Step 27)', () => {
  it('creates schema and seeds default config', () => {
    const config = store.getConfig();
    expect(config.timeLockHours).toBe(72);
    expect(config.requireStepConfirmation).toBe(true);
    expect(config.requireAllPartiesForDeletion).toBe(true);
    expect(config.lastReviewedAt).toBeNull();
  });

  it('updates config and reads back', () => {
    store.updateConfig({ timeLockHours: 48, requireStepConfirmation: false });
    const config = store.getConfig();
    expect(config.timeLockHours).toBe(48);
    expect(config.requireStepConfirmation).toBe(false);
    expect(config.requireAllPartiesForDeletion).toBe(true);
  });

  it('CRUD for trusted parties', () => {
    const party = makeParty();
    store.insertParty(party);

    const fetched = store.getParty(party.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.name).toBe('Alice Smith');
    expect(fetched!.email).toBe('alice@example.com');

    const updated = store.updateParty(party.id, { name: 'Alice Johnson' });
    expect(updated!.name).toBe('Alice Johnson');

    const all = store.getAllParties();
    expect(all).toHaveLength(1);

    const removed = store.removeParty(party.id);
    expect(removed).toBe(true);
    expect(store.getAllParties()).toHaveLength(0);
  });

  it('returns actions in sequence order', () => {
    const party = makeParty();
    store.insertParty(party);

    const a3 = makeAction(party.id, 3);
    const a1 = makeAction(party.id, 1);
    const a2 = makeAction(party.id, 2);

    store.insertAction(a3);
    store.insertAction(a1);
    store.insertAction(a2);

    const actions = store.getActionsForParty(party.id);
    expect(actions).toHaveLength(3);
    expect(actions[0]!.sequenceOrder).toBe(1);
    expect(actions[1]!.sequenceOrder).toBe(2);
    expect(actions[2]!.sequenceOrder).toBe(3);
  });

  it('stores and retrieves notification templates', () => {
    const party = makeParty();
    store.insertParty(party);
    const action = makeAction(party.id, 1);
    store.insertAction(action);

    const template = makeTemplate(party.id, action.id);
    store.insertTemplate(template);

    const fetched = store.getTemplateForAction(action.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.recipientName).toBe('Bob Jones');
    expect(fetched!.subject).toBe('An important message');

    const allForParty = store.getTemplatesForParty(party.id);
    expect(allForParty).toHaveLength(1);
  });

  it('cascade deletes actions and templates when party removed', () => {
    const party = makeParty();
    store.insertParty(party);

    const action = makeAction(party.id, 1);
    store.insertAction(action);

    const template = makeTemplate(party.id, action.id);
    store.insertTemplate(template);

    // Verify data exists
    expect(store.getActionsForParty(party.id)).toHaveLength(1);
    expect(store.getTemplatesForParty(party.id)).toHaveLength(1);

    // Remove party — cascades
    store.removeParty(party.id);

    expect(store.getActionsForParty(party.id)).toHaveLength(0);
    expect(store.getTemplatesForParty(party.id)).toHaveLength(0);
  });
});
