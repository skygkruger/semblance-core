/**
 * Step 27 — InheritanceTracker tests (Commit 8).
 * Tests stale template insight, empty when not premium,
 * premium gate blocks, and premium gate allows.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { PremiumGate } from '@semblance/core/premium/premium-gate';
import { InheritanceConfigStore } from '@semblance/core/inheritance/inheritance-config-store';
import { InheritanceTracker } from '@semblance/core/inheritance/inheritance-tracker';
import { nanoid } from 'nanoid';

let db: InstanceType<typeof Database>;
let gate: PremiumGate;
let store: InheritanceConfigStore;

function activatePremium(): void {
  db.prepare(`
    INSERT OR REPLACE INTO license (id, tier, activated_at, expires_at, license_key)
    VALUES (1, 'digital-representative', ?, NULL, 'sem_test.eyJ0aWVyIjoiZGlnaXRhbC1yZXByZXNlbnRhdGl2ZSJ9.sig')
  `).run(new Date().toISOString());
}

function seedStaleTemplate(partyId: string): void {
  const now = new Date().toISOString();
  const actionId = `ia_${nanoid()}`;

  store.insertParty({
    id: partyId, name: 'Test Party', email: 'test@x.com',
    relationship: 'spouse', passphraseHash: 'hash',
    createdAt: now, updatedAt: now,
  });

  store.insertAction({
    id: actionId, partyId, category: 'notification',
    sequenceOrder: 1, actionType: 'email.send', payload: {},
    label: 'Notify', requiresDeletionConsensus: false,
    createdAt: now, updatedAt: now,
  });

  // Template last reviewed 100 days ago (>90 day threshold)
  const staleDate = new Date(Date.now() - 100 * 86_400_000).toISOString();
  store.insertTemplate({
    id: `nt_${nanoid()}`, partyId, actionId,
    recipientName: 'Someone', recipientEmail: 'someone@x.com',
    subject: 'Subject', body: 'Body', lastReviewedAt: staleDate,
    createdAt: staleDate, updatedAt: staleDate,
  });
}

beforeEach(() => {
  db = new Database(':memory:');
  gate = new PremiumGate(db as unknown as DatabaseHandle);
  store = new InheritanceConfigStore(db as unknown as DatabaseHandle);
  store.initSchema();
});

afterEach(() => {
  db.close();
});

describe('InheritanceTracker (Step 27)', () => {
  it('generates stale template insight when templates are >90 days old', () => {
    activatePremium();
    seedStaleTemplate('p1');

    const tracker = new InheritanceTracker({ store, premiumGate: gate });
    const insights = tracker.generateInsights();

    expect(insights).toHaveLength(1);
    expect(insights[0]!.type).toBe('inheritance-stale-template');
    expect(insights[0]!.summary).toContain('not been reviewed');
  });

  it('returns empty when not premium', () => {
    // Do NOT activate premium
    seedStaleTemplate('p2');

    const tracker = new InheritanceTracker({ store, premiumGate: gate });
    const insights = tracker.generateInsights();

    expect(insights).toHaveLength(0);
  });

  it('premium gate blocks inheritance-protocol feature when free', () => {
    expect(gate.isFeatureAvailable('inheritance-protocol')).toBe(false);
  });

  it('premium gate allows inheritance-protocol feature when premium', () => {
    activatePremium();
    expect(gate.isFeatureAvailable('inheritance-protocol')).toBe(true);
  });
});
