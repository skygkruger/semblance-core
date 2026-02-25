/**
 * Step 29 — PrivacyTracker tests (Commit 7).
 * Tests proactive insight generation for privacy-related suggestions.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { PremiumGate } from '@semblance/core/premium/premium-gate';
import { PrivacyTracker } from '@semblance/core/privacy/privacy-tracker';

let db: InstanceType<typeof Database>;
let gate: PremiumGate;

function activatePremium(): void {
  db.prepare(`
    INSERT OR REPLACE INTO license (id, tier, activated_at, expires_at, license_key)
    VALUES (1, 'digital-representative', ?, NULL, 'sem_test.eyJ0aWVyIjoiZGlnaXRhbC1yZXByZXNlbnRhdGl2ZSJ9.sig')
  `).run(new Date().toISOString());
}

function addIndexedData(): void {
  db.exec(`CREATE TABLE IF NOT EXISTS indexed_emails (id TEXT PRIMARY KEY)`);
  db.exec(`INSERT INTO indexed_emails VALUES ('e1')`);
}

beforeEach(() => {
  db = new Database(':memory:');
  gate = new PremiumGate(db as unknown as DatabaseHandle);
});

afterEach(() => {
  db.close();
});

describe('PrivacyTracker (Step 29)', () => {
  it('returns empty when data is minimal', () => {
    const tracker = new PrivacyTracker({ db: db as unknown as DatabaseHandle, premiumGate: gate });
    const insights = tracker.generateInsights();
    expect(insights).toHaveLength(0);
  });

  it('suggests report generation when stale (premium)', () => {
    activatePremium();
    addIndexedData();

    const tracker = new PrivacyTracker({ db: db as unknown as DatabaseHandle, premiumGate: gate });

    // Insert a stale report (60 days ago)
    const staleDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO privacy_reports (id, generated_at) VALUES (?, ?)').run('r1', staleDate);

    const insights = tracker.generateInsights();
    expect(insights).toHaveLength(1);
    expect(insights[0]!.type).toBe('privacy-report-suggestion');
    expect(insights[0]!.summary).toContain('over 30 days old');
  });

  it('suggests dashboard for free users with data', () => {
    addIndexedData();
    const tracker = new PrivacyTracker({ db: db as unknown as DatabaseHandle, premiumGate: gate });
    const insights = tracker.generateInsights();
    expect(insights).toHaveLength(1);
    expect(insights[0]!.type).toBe('privacy-dashboard-suggestion');
    expect(insights[0]!.summary).toContain('Privacy Dashboard');
  });

  it('returns empty when recent report exists (premium)', () => {
    activatePremium();
    addIndexedData();

    const tracker = new PrivacyTracker({ db: db as unknown as DatabaseHandle, premiumGate: gate });

    // Insert a recent report
    const recentDate = new Date().toISOString();
    db.prepare('INSERT INTO privacy_reports (id, generated_at) VALUES (?, ?)').run('r1', recentDate);

    const insights = tracker.generateInsights();
    expect(insights).toHaveLength(0);
  });
});
